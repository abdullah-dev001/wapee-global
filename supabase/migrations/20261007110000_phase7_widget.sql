-- Phase 7A (3/4): the embed widget — keys, allowed domains, origin validation.
--
-- HOW EMBEDDING WORKS (and what the database can and cannot enforce):
--   1. A small script on the customer's site calls the `validate_widget` Edge
--      Function with its public key. The function reads the browser-set
--      `Origin` header, asks `validate_widget_origin()` whether that origin is
--      allowed for the key, and returns a short-lived (1h) signed embed token
--      bound to slug + origin.
--   2. The script injects an iframe of the public booking page carrying the token.
--   3. REAL enforcement of "only allowed domains may frame the page" is the
--      `Content-Security-Policy: frame-ancestors` response header on the
--      booking page. The static web host must emit it; `get_widget_frame_ancestors()`
--      supplies the value. THAT IS A LAUNCH BLOCKER (see context/_handoff.md).
--
-- PLAN GATING (Team and above, doc §7.4) is Phase 8: `widget_feature_enabled()`
-- is the single seam, currently always true.

create or replace function public.widget_feature_enabled(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select true  -- Phase 8: businesses.plan in ('team','business') or null (trial)
$$;
revoke all on function public.widget_feature_enabled(uuid) from public, anon, authenticated;

create or replace function public.widget_domains_ok(p_domains text[])
returns boolean language sql immutable set search_path = '' as $$
  select p_domains is not null
    and coalesce(array_length(p_domains, 1), 0) <= 10
    and not exists (
      select 1 from unnest(p_domains) d
      where d is null
         or d !~ '^(localhost|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})$')
    and (select count(distinct d) from unnest(p_domains) d) = coalesce(array_length(p_domains, 1), 0)
$$;

create table public.widget_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  public_key text not null unique,
  -- Lowercase hostnames, no scheme/port/path. Exact match: a subdomain must be listed.
  allowed_domains text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  constraint widget_keys_public_key check (public_key ~ '^wk_[0-9a-f]{32}$'),
  constraint widget_keys_domains check (public.widget_domains_ok(allowed_domains))
);
-- One live key per business.
create unique index widget_keys_business_uidx on public.widget_keys (business_id) where deleted_at is null;
create index widget_keys_created_by_idx on public.widget_keys (created_by) where created_by is not null;

create trigger widget_keys_set_updated_at before update on public.widget_keys
  for each row execute function public.set_updated_at();

alter table public.widget_keys enable row level security;
create policy widget_keys_select on public.widget_keys for select to authenticated
  using (deleted_at is null and public.can(business_id, null, 'website.edit'));
revoke all on public.widget_keys from anon, authenticated, public;
grant select on public.widget_keys to authenticated;

-- ---------------------------------------------------------------------------
-- Owner RPCs (website.edit)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_widget_key(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_key text;
begin
  if p_business_id is null or not public.can(p_business_id, null, 'website.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if not public.widget_feature_enabled(p_business_id) then
    return jsonb_build_object('ok', false, 'code', 'feature_unavailable');
  end if;
  select k.id, k.public_key into v_id, v_key from public.widget_keys k
  where k.business_id = p_business_id and k.deleted_at is null;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'created', false, 'public_key', v_key);
  end if;
  v_key := 'wk_' || pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.widget_keys (business_id, public_key, created_by)
  values (p_business_id, v_key, auth.uid())
  on conflict (business_id) where deleted_at is null do nothing
  returning id into v_id;
  if v_id is null then
    select k.public_key into v_key from public.widget_keys k
    where k.business_id = p_business_id and k.deleted_at is null;
    return jsonb_build_object('ok', true, 'created', false, 'public_key', v_key);
  end if;
  perform public.write_audit_log(p_business_id, 'widget.key_created', 'widget_key', v_id::text, null, null);
  return jsonb_build_object('ok', true, 'created', true, 'public_key', v_key);
end $$;

create or replace function public.save_widget_domains(p_business_id uuid, p_domains text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_k record;
  v_norm text[];
begin
  if p_business_id is null or not public.can(p_business_id, null, 'website.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select k.id, k.allowed_domains into v_k from public.widget_keys k
  where k.business_id = p_business_id and k.deleted_at is null for update;
  if v_k.id is null then return jsonb_build_object('ok', false, 'code', 'no_key'); end if;
  if p_domains is null then return jsonb_build_object('ok', false, 'code', 'invalid_domains'); end if;

  select coalesce(array_agg(distinct lower(btrim(d)) order by lower(btrim(d))), '{}') into v_norm from unnest(p_domains) d;
  if not public.widget_domains_ok(v_norm) or coalesce(array_length(v_norm, 1), 0) < coalesce(array_length(p_domains, 1), 0) then
    return jsonb_build_object('ok', false, 'code', 'invalid_domains');
  end if;

  update public.widget_keys set allowed_domains = v_norm where id = v_k.id;
  perform public.write_audit_log(p_business_id, 'widget.domains_changed', 'widget_key', v_k.id::text,
    jsonb_build_object('allowed_domains', v_k.allowed_domains), jsonb_build_object('allowed_domains', v_norm));
  return jsonb_build_object('ok', true, 'allowed_domains', to_jsonb(v_norm));
end $$;

create or replace function public.set_widget_active(p_business_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_k record;
begin
  if p_business_id is null or p_active is null or not public.can(p_business_id, null, 'website.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select k.id, k.is_active into v_k from public.widget_keys k
  where k.business_id = p_business_id and k.deleted_at is null for update;
  if v_k.id is null then return jsonb_build_object('ok', false, 'code', 'no_key'); end if;
  if v_k.is_active = p_active then return jsonb_build_object('ok', true, 'changed', false); end if;
  update public.widget_keys set is_active = p_active where id = v_k.id;
  perform public.write_audit_log(p_business_id,
    case when p_active then 'widget.activated' else 'widget.deactivated' end, 'widget_key', v_k.id::text, null, null);
  return jsonb_build_object('ok', true, 'changed', true);
end $$;

create or replace function public.rotate_widget_key(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_k record; v_key text;
begin
  if p_business_id is null or not public.can(p_business_id, null, 'website.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select k.id into v_k from public.widget_keys k
  where k.business_id = p_business_id and k.deleted_at is null for update;
  if v_k.id is null then return jsonb_build_object('ok', false, 'code', 'no_key'); end if;
  v_key := 'wk_' || pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
  update public.widget_keys set public_key = v_key where id = v_k.id;
  perform public.write_audit_log(p_business_id, 'widget.key_rotated', 'widget_key', v_k.id::text, null, null);
  return jsonb_build_object('ok', true, 'public_key', v_key);
end $$;

-- ---------------------------------------------------------------------------
-- service_role: origin validation + the frame-ancestors value
-- ---------------------------------------------------------------------------
-- Every failure is the same {ok:false, code:'not_found'}: unknown key, inactive
-- key, inactive business, feature off, origin not listed, malformed origin.
create or replace function public.validate_widget_origin(p_public_key text, p_origin text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_m text[];
  v_host text;
  v_slug text;
begin
  if p_public_key is null or p_public_key !~ '^wk_[0-9a-f]{32}$' or p_origin is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_m := regexp_match(lower(btrim(p_origin)), '^(https?)://([a-z0-9.-]{1,253})(:[0-9]{1,5})?/?$');
  if v_m is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_host := v_m[2];
  -- Plain http is only acceptable for local development.
  if v_m[1] = 'http' and v_host <> 'localhost' then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select b.slug::text into v_slug
  from public.widget_keys k
  join public.businesses b on b.id = k.business_id and b.deleted_at is null
  where k.public_key = p_public_key and k.is_active and k.deleted_at is null
    and v_host = any (k.allowed_domains)
    and public.business_is_active(b.id)
    and public.widget_feature_enabled(b.id);
  if v_slug is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'slug', v_slug);
end $$;

-- The CSP `frame-ancestors` sources for a business's booking page. Empty array
-- = nobody may frame it from outside.
create or replace function public.get_widget_frame_ancestors(p_slug text)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce((
    select array_agg(case when d = 'localhost' then 'http://localhost:*' else 'https://' || d end order by d)
    from public.widget_keys k
    join public.businesses b on b.id = k.business_id and b.deleted_at is null
    cross join lateral unnest(k.allowed_domains) d
    where b.slug = p_slug::extensions.citext and k.is_active and k.deleted_at is null
      and public.business_is_active(b.id) and public.widget_feature_enabled(b.id)
  ), '{}')
$$;

revoke all on function public.widget_domains_ok(text[]) from public, anon;
revoke all on function public.ensure_widget_key(uuid) from public, anon;
revoke all on function public.save_widget_domains(uuid, text[]) from public, anon;
revoke all on function public.set_widget_active(uuid, boolean) from public, anon;
revoke all on function public.rotate_widget_key(uuid) from public, anon;
grant execute on function public.ensure_widget_key(uuid) to authenticated;
grant execute on function public.save_widget_domains(uuid, text[]) to authenticated;
grant execute on function public.set_widget_active(uuid, boolean) to authenticated;
grant execute on function public.rotate_widget_key(uuid) to authenticated;
revoke all on function public.validate_widget_origin(text, text) from public, anon, authenticated;
revoke all on function public.get_widget_frame_ancestors(text) from public, anon, authenticated;
grant execute on function public.validate_widget_origin(text, text) to service_role;
grant execute on function public.get_widget_frame_ancestors(text) to service_role;

insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('validate_widget', 'ip', 60, 120, 'Widget key/origin validation and embed-token verification. Every widget page load calls it once.');
