-- Phase 10C fix, part 2: the previous migration restored "whatever this transaction switched off", which in a
-- long transaction (several portal calls, e.g. a test run) could bring back more than one old link and hit the
-- one-live-token rule. The borrowed token now remembers exactly WHICH link it stepped past (transaction-local),
-- and gives back only that one, only if the booking is not cancelled and no other live token exists.
create or replace function public.portal_mint_manage_token(p_business_id uuid, p_appointment_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_ends timestamptz;
  v_prev uuid;
begin
  select a.ends_at into v_ends from public.appointments a where a.id = p_appointment_id;
  update public.booking_manage_tokens set revoked_at = now()
  where appointment_id = p_appointment_id and revoked_at is null
  returning id into v_prev;
  perform set_config('portal.stepped_aside', coalesce(v_prev::text, ''), true);
  insert into public.booking_manage_tokens (business_id, appointment_id, token_hash, expires_at)
  values (p_business_id, p_appointment_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), greatest(v_ends, now() + interval '5 minutes'));
  return v_token;
end $$;
revoke all on function public.portal_mint_manage_token(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_revoke_manage_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_appt uuid;
  v_prev uuid := nullif(current_setting('portal.stepped_aside', true), '')::uuid;
begin
  update public.booking_manage_tokens set revoked_at = coalesce(revoked_at, now())
  where token_hash = v_hash returning appointment_id into v_appt;
  perform set_config('portal.stepped_aside', '', true);
  if v_prev is null or v_appt is null then return; end if;
  update public.booking_manage_tokens t set revoked_at = null
  where t.id = v_prev and t.appointment_id = v_appt and t.revoked_at is not null
    and exists (select 1 from public.appointments a where a.id = v_appt and a.status <> 'cancelled')
    and not exists (select 1 from public.booking_manage_tokens o where o.appointment_id = v_appt and o.revoked_at is null);
end $$;
revoke all on function public.portal_revoke_manage_token(text) from public, anon, authenticated;
