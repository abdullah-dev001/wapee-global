-- F23 (QA run 2026-10-17, founder decision 2026-10-18): when a CUSTOMER
-- cancels before the visit starts (guest manage link, and the client portal,
-- which goes through cancel_booking), any package session deducted for that
-- appointment is given back.
--
-- Uses the existing ledger mechanism: a NEW 'reversal' row per deduction
-- (session_usages_shape requires reverses_usage_id; the deduction is never
-- changed or deleted, and the ledger guard forbids that anyway). The partial
-- unique index on reverses_usage_id makes a second reversal impossible, and
-- ON CONFLICT DO NOTHING keeps a retried cancel from raising. created_by is
-- NULL (no staff member did this); the reason and an audit row say why.
--
-- Staff cancellations from the dashboard are unchanged (staff decide by hand).
-- cancel_booking already refuses after its cutoff, which is never later than
-- the start; the helper checks the start again on its own.

create or replace function public.reverse_package_sessions_for_customer_cancel(p_appointment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt record;
  u record;
  v_rev uuid;
  v_n integer := 0;
begin
  select a.id, a.business_id, a.starts_at into v_appt
  from public.appointments a where a.id = p_appointment_id;
  if v_appt.id is null or now() >= v_appt.starts_at then
    return 0;
  end if;

  for u in
    select su.id, su.business_id, su.branch_id, su.client_package_id, su.appointment_id, su.service_id
    from public.session_usages su
    where su.appointment_id = p_appointment_id
      and su.kind = 'deduct'
      and not exists (select 1 from public.session_usages r where r.reverses_usage_id = su.id)
    order by su.created_at
  loop
    insert into public.session_usages (business_id, branch_id, client_package_id, kind, appointment_id, service_id,
                                       reverses_usage_id, reason, created_by)
    values (u.business_id, u.branch_id, u.client_package_id, 'reversal', u.appointment_id, u.service_id,
            u.id, 'Customer cancelled before the visit', null)
    on conflict (reverses_usage_id) where reverses_usage_id is not null do nothing
    returning id into v_rev;

    if v_rev is not null then
      v_n := v_n + 1;
      perform public.write_audit_log(u.business_id, 'package.session_reversed', 'client_package', u.client_package_id::text, null,
        jsonb_build_object('reversal_id', v_rev, 'reverses_usage_id', u.id, 'by', 'customer_cancel',
                           'appointment_id', p_appointment_id));
    end if;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.reverse_package_sessions_for_customer_cancel(uuid) from public;
revoke execute on function public.reverse_package_sessions_for_customer_cancel(uuid) from anon, authenticated;
grant execute on function public.reverse_package_sessions_for_customer_cancel(uuid) to service_role;

-- cancel_booking: unchanged except the call after the token is revoked.
CREATE OR REPLACE FUNCTION public.cancel_booking(p_token text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_row record;
  v_cutoff timestamptz;
begin
  v_id := public.resolve_manage_token(p_token);
  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select a.id, a.status, a.starts_at, bs.customer_can_cancel, bs.cancel_cutoff_hours
  into v_row
  from public.appointments a
  join public.booking_settings bs on bs.branch_id = a.branch_id
  where a.id = v_id
  -- Lock the row: two taps on a slow connection must not both cancel, and a
  -- cancel racing a reschedule must serialise.
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  -- Already finished with, one way or another. Reported distinctly from a bad
  -- token because the guest holds a VALID token here — there is nothing to leak.
  if v_row.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable', 'status', v_row.status);
  end if;

  -- doc §6.2: "customer can cancel (yes, 24h)". Off means off.
  if not v_row.customer_can_cancel then
    return jsonb_build_object('ok', false, 'code', 'cancel_not_allowed');
  end if;

  v_cutoff := v_row.starts_at - make_interval(hours => v_row.cancel_cutoff_hours);
  if now() >= v_cutoff then
    return jsonb_build_object(
      'ok', false,
      'code', 'cancel_window_passed',
      'cutoff_hours', v_row.cancel_cutoff_hours
    );
  end if;

  update public.appointments
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_guest = true,
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_id;

  -- The token dies with the booking: there is nothing left to manage, and a
  -- live token on a cancelled appointment is pure attack surface.
  update public.booking_manage_tokens
  set revoked_at = now()
  where appointment_id = v_id and revoked_at is null;

  -- A customer who cancels before the visit gets the package session back
  -- (founder decision, QA F23). Reversal rows only; the deduction stays.
  perform public.reverse_package_sessions_for_customer_cancel(v_id);

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$function$;
