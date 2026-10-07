-- Phase 10C (1/3): CLIENT PORTAL (add-on `client_portal`) — schema, sign-in, sessions.
--
-- Decided with the user (2026-10-07):
--   * customers are NOT Supabase Auth users and never get a business_members row, a role or a JWT:
--     they sign in with a single-use emailed magic link and get a hashed, revocable SESSION TOKEN
--     scoped to ONE business. Every call goes through the `portal` Edge Function, which calls the
--     service_role-only RPCs below; each RPC re-checks the session. anon / authenticated have NO
--     access to these tables and NO EXECUTE on these functions.
--   * a session is linked to the clients of that business whose email EXACTLY matches (case-insensitive)
--     the email whose link was clicked, re-resolved on every call (a changed email loses access at once)
--   * no account enumeration: asking for a link answers identically for a known and an unknown email
--   * sessions last 14 days; tokens and sessions are stored only as sha256
--   * the add-on off (or an inactive business) makes every RPC answer the same generic refusal

create table public.portal_login_tokens (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email       text not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint portal_login_tokens_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint portal_login_tokens_email check (char_length(email) between 3 and 254)
);
create index portal_login_tokens_business_idx on public.portal_login_tokens (business_id, email, created_at desc);

create table public.portal_sessions (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  email        text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz,
  ip_hash      text,
  constraint portal_sessions_hash check (token_hash ~ '^[0-9a-f]{64}$')
);
create index portal_sessions_business_idx on public.portal_sessions (business_id, email);

alter table public.portal_login_tokens enable row level security;
alter table public.portal_sessions enable row level security;
revoke all on public.portal_login_tokens, public.portal_sessions from anon, authenticated;

-- A login token is used or revoked once, never changed otherwise, never deleted by hand.
create or replace function public.enforce_portal_token_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then return old; end if;
    raise exception 'Portal tokens are kept; they expire' using errcode = '23514';
  end if;
  if new.token_hash is distinct from old.token_hash or new.business_id is distinct from old.business_id
     or new.email is distinct from old.email or new.expires_at is distinct from old.expires_at
     or (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'A portal token cannot be changed' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.enforce_portal_token_guard() from public, anon, authenticated;
create trigger portal_login_tokens_guard before update or delete on public.portal_login_tokens
  for each row execute function public.enforce_portal_token_guard();

-- sessions: only revoked_at / last_seen_at ever change
create or replace function public.enforce_portal_session_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then return old; end if;
    raise exception 'Portal sessions are kept; they expire' using errcode = '23514';
  end if;
  if new.token_hash is distinct from old.token_hash or new.business_id is distinct from old.business_id
     or new.email is distinct from old.email or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'A portal session cannot be changed' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.enforce_portal_session_guard() from public, anon, authenticated;
create trigger portal_sessions_guard before update or delete on public.portal_sessions
  for each row execute function public.enforce_portal_session_guard();

-- Rate limits (the counters live in the database and fail closed).
insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('portal_info', 'ip', 3600, 300, 'The portal entry page asking whether the portal exists.'),
  ('portal_request_login', 'ip', 3600, 10, 'Asking for a sign-in link: 10 an hour from one address.'),
  ('portal_request_login', 'key', 3600, 3, 'Asking for a sign-in link for ONE email: 3 an hour (mail bombing).'),
  ('portal_exchange', 'ip', 3600, 30, 'Trading a link for a session.'),
  ('portal_read', 'ip', 3600, 1200, 'Portal reads.'),
  ('portal_write', 'ip', 3600, 60, 'Portal cancel / reschedule / book.')
on conflict do nothing;

alter table public.message_outbox drop constraint message_outbox_event_check;
alter table public.message_outbox add constraint message_outbox_event_check check (event in (
  'booking_confirmed', 'pending_received', 'reminder', 'rescheduled', 'cancelled',
  'manage_link', 'review_request',
  'staff_new_booking', 'staff_pending_approval', 'staff_cancelled', 'staff_reminder',
  'report_summary', 'staff_low_stock', 'low_stock', 'form_request', 'portal_login'));

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public.portal_norm_email(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case when p_email is null then null else lower(btrim(p_email)) end
$$;
revoke all on function public.portal_norm_email(text) from public, anon, authenticated;

-- The clients of a business that belong to a verified email.
create or replace function public.portal_client_ids(p_business_id uuid, p_email text)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id order by c.created_at, c.id), '{}')
  from public.clients c
  where c.business_id = p_business_id and c.deleted_at is null and c.email is not null
    and lower(c.email::text) = p_email
$$;
revoke all on function public.portal_client_ids(uuid, text) from public, anon, authenticated;

-- Resolve a raw session token. NULL = not signed in (unknown, expired, revoked, add-on off, business
-- inactive, nobody linked any more): ONE answer for all of them.
create or replace function public.portal_ctx(p_session text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_ids uuid[];
begin
  if p_session is null or char_length(p_session) < 32 or char_length(p_session) > 200 then return null; end if;
  select s.id, s.business_id, s.email, s.last_seen_at into v_s
  from public.portal_sessions s
  where s.token_hash = encode(extensions.digest(p_session, 'sha256'), 'hex')
    and s.revoked_at is null and s.expires_at > now();
  if v_s.id is null then return null; end if;
  if not public.business_is_active(v_s.business_id) or not public.business_has_feature(v_s.business_id, 'client_portal') then
    return null;
  end if;
  v_ids := public.portal_client_ids(v_s.business_id, v_s.email);
  if coalesce(array_length(v_ids, 1), 0) = 0 then return null; end if;
  if v_s.last_seen_at < now() - interval '5 minutes' then
    update public.portal_sessions set last_seen_at = now() where id = v_s.id;
  end if;
  return jsonb_build_object('session_id', v_s.id, 'business_id', v_s.business_id, 'email', v_s.email, 'client_ids', to_jsonb(v_ids));
end $$;
revoke all on function public.portal_ctx(text) from public, anon, authenticated;

create or replace function public.portal_audit(p_business_id uuid, p_action text, p_entity_type text, p_entity_id text, p_after jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (p_business_id, null, p_action, p_entity_type, p_entity_id, null, p_after);
$$;
revoke all on function public.portal_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public entry (service_role only, called by the Edge Function)
-- ---------------------------------------------------------------------------
-- Is there a portal at this slug? One answer for unknown slug / add-on off / inactive business.
create or replace function public.portal_info(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_b record;
begin
  select b.id, b.name into v_b from public.businesses b where b.slug = lower(btrim(coalesce(p_slug, ''))) and b.deleted_at is null;
  if v_b.id is null or not public.business_is_active(v_b.id) or not public.business_has_feature(v_b.id, 'client_portal') then
    return jsonb_build_object('ok', false, 'code', 'not_available');
  end if;
  return jsonb_build_object('ok', true, 'business_name', v_b.name);
end $$;

-- Ask for a sign-in link. ALWAYS {ok:true} for a well-formed email, known or not (no enumeration).
-- A link is created and emailed only when the portal is on and a client of the business has that email.
create or replace function public.portal_request_login(p_slug text, p_email text, p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := public.portal_norm_email(p_email);
  v_b record;
  v_ids uuid[];
  v_client record;
  v_branch uuid;
  v_token text;
  v_id uuid;
begin
  if v_email is null or char_length(v_email) not between 3 and 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;
  select b.id into v_b from public.businesses b where b.slug = lower(btrim(coalesce(p_slug, ''))) and b.deleted_at is null;
  if v_b.id is null or not public.business_is_active(v_b.id) or not public.business_has_feature(v_b.id, 'client_portal') then
    return jsonb_build_object('ok', true);
  end if;
  v_ids := public.portal_client_ids(v_b.id, v_email);
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', true); end if;
  -- belt and braces behind the Edge rate limit: at most 5 links an hour per email
  if (select count(*) from public.portal_login_tokens t where t.business_id = v_b.id and t.email = v_email and t.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', true);
  end if;

  select c.id, c.first_branch_id into v_client from public.clients c where c.id = v_ids[1];
  v_branch := coalesce(v_client.first_branch_id, (select b.id from public.branches b where b.business_id = v_b.id and b.is_primary and b.deleted_at is null limit 1));
  update public.portal_login_tokens set revoked_at = now()
  where business_id = v_b.id and email = v_email and used_at is null and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.portal_login_tokens (business_id, email, token_hash, expires_at)
  values (v_b.id, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '15 minutes')
  returning id into v_id;
  perform public.outbox_enqueue(v_b.id, v_branch, 'portal_login', 'portal_login:' || v_id, null, v_client.id, null, null, null,
                                jsonb_build_object('token_id', v_id), v_token);
  return jsonb_build_object('ok', true);
end $$;

-- Trade a link for a session. Single use, 15 minutes, generic failure, never raises.
create or replace function public.portal_exchange_token(p_token text, p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_t record;
  v_ids uuid[];
  v_session text;
  v_exp timestamptz := now() + interval '14 days';
  v_biz record;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 200 then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  select t.id, t.business_id, t.email, t.expires_at, t.used_at, t.revoked_at into v_t
  from public.portal_login_tokens t
  where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if v_t.id is null or v_t.used_at is not null or v_t.revoked_at is not null or v_t.expires_at <= now()
     or not public.business_is_active(v_t.business_id) or not public.business_has_feature(v_t.business_id, 'client_portal') then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  v_ids := public.portal_client_ids(v_t.business_id, v_t.email);
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'code', 'invalid_token'); end if;

  update public.portal_login_tokens set used_at = now() where id = v_t.id;
  v_session := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.portal_sessions (business_id, email, token_hash, expires_at, ip_hash)
  values (v_t.business_id, v_t.email, encode(extensions.digest(v_session, 'sha256'), 'hex'), v_exp, p_ip_hash);
  select b.name, b.slug into v_biz from public.businesses b where b.id = v_t.business_id;
  perform public.portal_audit(v_t.business_id, 'portal.login', 'portal_session', null, jsonb_build_object('clients', coalesce(array_length(v_ids, 1), 0)));
  return jsonb_build_object('ok', true, 'session_token', v_session, 'expires_at', v_exp, 'business_name', v_biz.name, 'slug', v_biz.slug);
end $$;

create or replace function public.portal_sign_out(p_session text, p_all boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_n integer;
begin
  select s.id, s.business_id, s.email into v_s from public.portal_sessions s
  where s.token_hash = encode(extensions.digest(coalesce(p_session, ''), 'sha256'), 'hex') and s.revoked_at is null;
  if v_s.id is null then return jsonb_build_object('ok', true); end if;
  if p_all then
    update public.portal_sessions set revoked_at = now() where business_id = v_s.business_id and email = v_s.email and revoked_at is null;
    get diagnostics v_n = row_count;
  else
    update public.portal_sessions set revoked_at = now() where id = v_s.id;
    v_n := 1;
  end if;
  perform public.portal_audit(v_s.business_id, 'portal.signed_out', 'portal_session', v_s.id::text, jsonb_build_object('sessions', v_n, 'all', p_all));
  return jsonb_build_object('ok', true);
end $$;

-- Every portal RPC is for the Edge Function only.
do $$
declare f text;
begin
  foreach f in array array['portal_info(text)', 'portal_request_login(text,text,text)', 'portal_exchange_token(text,text)', 'portal_sign_out(text,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
