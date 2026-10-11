-- Phase 10C fix: the portal borrows the guest-manage engine through a short-lived manage token, but an online
-- booking already owns its ONE live token (unique index booking_manage_tokens_one_live), so cancelling or moving
-- a portal- or website-booked appointment failed with a unique violation. The borrowed token now steps aside:
-- the customer's emailed link is switched off for the length of this one transaction and switched back on
-- afterwards (unless the booking ended up cancelled). Same signatures, same grants (service_role only).
create or replace function public.portal_mint_manage_token(p_business_id uuid, p_appointment_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_ends timestamptz;
begin
  select a.ends_at into v_ends from public.appointments a where a.id = p_appointment_id;
  update public.booking_manage_tokens set revoked_at = now()
  where appointment_id = p_appointment_id and revoked_at is null;
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
begin
  update public.booking_manage_tokens set revoked_at = coalesce(revoked_at, now())
  where token_hash = v_hash returning appointment_id into v_appt;
  -- give the customer's own emailed link back (only those this transaction switched off, never for a cancelled booking)
  update public.booking_manage_tokens set revoked_at = null
  where appointment_id = v_appt and token_hash <> v_hash and revoked_at = now()
    and exists (select 1 from public.appointments a where a.id = v_appt and a.status <> 'cancelled');
end $$;
revoke all on function public.portal_revoke_manage_token(text) from public, anon, authenticated;
