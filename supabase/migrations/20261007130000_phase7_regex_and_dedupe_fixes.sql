-- Phase 7A fixes found by the first test run (the 4 migrations before this one
-- are applied and are not edited, per CLAUDE.md).
--
-- 1. Postgres regex repetition counts are capped at 255: `{3,500}` raised
--    "invalid repetition count(s)" the first time a URL was validated. Length
--    is now a separate check.
-- 2. save_widget_domains refused a list that merely contained a duplicate
--    (it compared the de-duplicated length with the input length). A duplicate
--    is harmless: it is collapsed.

create or replace function public.website_url_err(p jsonb, k text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if not (p ? k) or jsonb_typeof(p -> k) = 'null' then return null; end if;
  if jsonb_typeof(p -> k) <> 'string' then return 'bad_type:' || k; end if;
  -- https only: a stored `javascript:` or `data:` URL must be impossible.
  if char_length(p ->> k) > 500
     or (p ->> k) !~ '^https://[^[:space:]<>"'']+$'
     or char_length(p ->> k) < 11 then
    return 'bad_url:' || k;
  end if;
  return null;
end $$;
revoke all on function public.website_url_err(jsonb, text) from public, anon, authenticated;

alter table public.branches drop constraint branches_google_review_url;
alter table public.branches add constraint branches_google_review_url check (
  google_review_url is null
  or (char_length(google_review_url) between 11 and 500
      and google_review_url ~ '^https://[^[:space:]<>"'']+$')
);

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
  if p_domains is null or exists (select 1 from unnest(p_domains) d where d is null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_domains');
  end if;

  select coalesce(array_agg(distinct lower(btrim(d)) order by lower(btrim(d))), '{}') into v_norm from unnest(p_domains) d;
  if not public.widget_domains_ok(v_norm) then
    return jsonb_build_object('ok', false, 'code', 'invalid_domains');
  end if;

  update public.widget_keys set allowed_domains = v_norm where id = v_k.id;
  perform public.write_audit_log(p_business_id, 'widget.domains_changed', 'widget_key', v_k.id::text,
    jsonb_build_object('allowed_domains', v_k.allowed_domains), jsonb_build_object('allowed_domains', v_norm));
  return jsonb_build_object('ok', true, 'allowed_domains', to_jsonb(v_norm));
end $$;
revoke all on function public.save_widget_domains(uuid, text[]) from public, anon;
grant execute on function public.save_widget_domains(uuid, text[]) to authenticated;
