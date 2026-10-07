-- Phase 11A follow-up (found by suite 29):
--  1. enforce_last_owner: during a business delete the cascade removes business_members BEFORE their role
--     assignments, so the guard cannot resolve the business any more. While the erase flag is set for a business
--     (only gdpr_erase_business_commit sets it), an assignment whose member is already gone belongs to that cascade.
--  2. data_requests: the per-customer daily cap must not be defeated by a staff member resolving the request
--     (resolving forgets the email). The cap counts a SHA-256 of the email, which is not readable as an email.

create or replace function public.enforce_last_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business_id uuid;
  v_owner_count integer;
  v_flag text := coalesce(current_setting('wapee.erase_business', true), '');
begin
  select m.business_id into v_business_id
  from public.business_members m
  where m.id = coalesce(old.member_id, new.member_id);

  if v_flag <> '' and (v_business_id is null or v_business_id::text = v_flag) then
    return old;
  end if;

  select count(*) into v_owner_count
  from public.member_role_assignments a
  join public.business_members m on m.id = a.member_id
  join public.roles r on r.id = a.role_id
  where m.business_id = v_business_id
    and m.status = 'active'
    and m.deleted_at is null
    and r.key = 'owner'
    and r.business_id is null
    and a.id is distinct from old.id;

  if v_owner_count = 0 then
    raise exception 'A business must always have at least one active Owner'
      using errcode = '23514';
  end if;

  return old;
end;
$$;
revoke all on function public.enforce_last_owner() from public, anon, authenticated;

alter table public.data_requests add column email_hash text;
create index data_requests_email_hash_idx on public.data_requests (business_id, email_hash, created_at desc) where email_hash is not null;

create or replace function public.portal_create_data_request(p_session text, p_kind text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ctx jsonb;
  v_biz uuid;
  v_email text;
  v_hash text;
  v_id uuid;
begin
  if p_kind is null or p_kind not in ('export', 'erase') then return jsonb_build_object('ok', false, 'code', 'bad_request'); end if;
  v_ctx := public.portal_ctx(p_session);
  if v_ctx is null then return jsonb_build_object('ok', false, 'code', 'invalid_session'); end if;
  v_biz := (v_ctx ->> 'business_id')::uuid;
  v_email := v_ctx ->> 'email';
  v_hash := encode(extensions.digest(v_email, 'sha256'), 'hex');
  -- backstop behind the Edge Function's per-IP limit: 5 requests per customer per day (returns, never raises)
  if (select count(*) from public.data_requests d where d.business_id = v_biz and d.email_hash = v_hash
        and d.created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  insert into public.data_requests (business_id, kind, requester_email, email_hash) values (v_biz, p_kind, v_email, v_hash)
  on conflict (business_id, requester_email, kind) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  perform public.portal_audit(v_biz, 'portal.data_request', 'data_request', v_id::text, jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;
revoke all on function public.portal_create_data_request(text, text) from public, anon, authenticated;
grant execute on function public.portal_create_data_request(text, text) to service_role;
