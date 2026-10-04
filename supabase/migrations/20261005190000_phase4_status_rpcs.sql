-- Phase 4 part A: appointment status changes.
--
-- Every one of these checks `is_allowed_appointment_transition()` — the ONE
-- table defined in 20261005110000 — before writing. None of them ever
-- raises for an expected failure (a disallowed transition, a permission
-- refusal); all return {ok:false,code}, matching the public RPCs' contract so
-- the UI has one shape to handle everywhere.

-- ---------------------------------------------------------------------------
-- cancel_appointment
-- ---------------------------------------------------------------------------
create or replace function public.cancel_appointment(
  p_appointment_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id, a.business_id, a.branch_id, a.staff_id, a.status
  into v_row
  from public.appointments a
  where a.id = p_appointment_id and a.deleted_at is null
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.can(v_row.business_id, v_row.branch_id, 'appointments.cancel') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.has_permission_at_branch_scope(v_row.business_id, v_row.branch_id, 'appointments.cancel') then
    if v_row.staff_id is null or not public.is_own_staff_profile(v_row.staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;

  if not public.is_allowed_appointment_transition(v_row.status, 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', v_row.status);
  end if;

  update public.appointments
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_guest = false,
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_appointment_id;

  perform public.write_audit_log(
    v_row.business_id, 'appointment.cancelled', 'appointment', p_appointment_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'cancelled', 'reason', p_reason)
  );

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

comment on function public.cancel_appointment is
  'Dashboard cancel. Checks is_allowed_appointment_transition() first. SECURITY DEFINER, can()/scope check is the boundary.';

revoke all on function public.cancel_appointment(uuid, text) from public;
revoke execute on function public.cancel_appointment(uuid, text) from anon;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_no_show
-- ---------------------------------------------------------------------------
create or replace function public.mark_no_show(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id, a.business_id, a.branch_id, a.staff_id, a.status
  into v_row
  from public.appointments a
  where a.id = p_appointment_id and a.deleted_at is null
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.can(v_row.business_id, v_row.branch_id, 'appointments.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.has_permission_at_branch_scope(v_row.business_id, v_row.branch_id, 'appointments.edit') then
    if v_row.staff_id is null or not public.is_own_staff_profile(v_row.staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;

  if not public.is_allowed_appointment_transition(v_row.status, 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', v_row.status);
  end if;

  update public.appointments set status = 'no_show' where id = p_appointment_id;

  perform public.write_audit_log(
    v_row.business_id, 'appointment.no_show', 'appointment', p_appointment_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'no_show')
  );

  return jsonb_build_object('ok', true, 'status', 'no_show');
end;
$$;

comment on function public.mark_no_show is
  'Dashboard no-show. confirmed -> no_show only (is_allowed_appointment_transition). Terminal: never reopens. SECURITY DEFINER, can()/scope check is the boundary.';

revoke all on function public.mark_no_show(uuid) from public;
revoke execute on function public.mark_no_show(uuid) from anon;
grant execute on function public.mark_no_show(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_completed
-- ---------------------------------------------------------------------------
create or replace function public.mark_completed(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id, a.business_id, a.branch_id, a.staff_id, a.status
  into v_row
  from public.appointments a
  where a.id = p_appointment_id and a.deleted_at is null
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.can(v_row.business_id, v_row.branch_id, 'appointments.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.has_permission_at_branch_scope(v_row.business_id, v_row.branch_id, 'appointments.edit') then
    if v_row.staff_id is null or not public.is_own_staff_profile(v_row.staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;

  if not public.is_allowed_appointment_transition(v_row.status, 'completed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', v_row.status);
  end if;

  update public.appointments set status = 'completed' where id = p_appointment_id;

  perform public.write_audit_log(
    v_row.business_id, 'appointment.completed', 'appointment', p_appointment_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'completed')
  );

  return jsonb_build_object('ok', true, 'status', 'completed');
end;
$$;

comment on function public.mark_completed is
  'Dashboard complete. confirmed -> completed only. Terminal: never reopens (Phase 5 links an invoice via appointments.invoice_id, never a status change back). SECURITY DEFINER, can()/scope check is the boundary.';

revoke all on function public.mark_completed(uuid) from public;
revoke execute on function public.mark_completed(uuid) from anon;
grant execute on function public.mark_completed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- approve_appointment (pending -> confirmed)
-- ---------------------------------------------------------------------------
create or replace function public.approve_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select a.id, a.business_id, a.branch_id, a.staff_id, a.status
  into v_row
  from public.appointments a
  where a.id = p_appointment_id and a.deleted_at is null
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Approving is an editorial decision over the booking, same permission as
  -- editing it (doc §9 has no separate "approve" permission).
  if not public.can(v_row.business_id, v_row.branch_id, 'appointments.approve') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if not public.has_permission_at_branch_scope(v_row.business_id, v_row.branch_id, 'appointments.approve') then
    if v_row.staff_id is null or not public.is_own_staff_profile(v_row.staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;

  if not public.is_allowed_appointment_transition(v_row.status, 'confirmed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', v_row.status);
  end if;

  update public.appointments set status = 'confirmed' where id = p_appointment_id;

  perform public.write_audit_log(
    v_row.business_id, 'appointment.approved', 'appointment', p_appointment_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'confirmed')
  );

  return jsonb_build_object('ok', true, 'status', 'confirmed');
end;
$$;

comment on function public.approve_appointment is
  'pending -> confirmed, for branches with confirmation = manual. Needs appointments.approve. SECURITY DEFINER, can()/scope check is the boundary.';

revoke all on function public.approve_appointment(uuid) from public;
revoke execute on function public.approve_appointment(uuid) from anon;
grant execute on function public.approve_appointment(uuid) to authenticated;
