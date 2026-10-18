-- F11 (QA run 2026-10-17): "Mark no-show" was accepted for an appointment
-- two days in the future (and the dialog says it cannot be undone). A no-show
-- is only knowable once the appointment has started, so mark_no_show now
-- returns {ok:false, code:'not_started'} before its start, before any write.
-- "Mark completed" stays allowed early on purpose (a client seen early, a
-- walk-in); the dashboard warns instead.

CREATE OR REPLACE FUNCTION public.mark_no_show(p_appointment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row record;
begin
  select a.id, a.business_id, a.branch_id, a.staff_id, a.status, a.starts_at
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

  -- Nobody can have failed to turn up before the appointment starts (QA F11).
  -- Checked before the write, like every other refusal here.
  if now() < v_row.starts_at then
    return jsonb_build_object('ok', false, 'code', 'not_started');
  end if;

  update public.appointments set status = 'no_show' where id = p_appointment_id;

  perform public.write_audit_log(
    v_row.business_id, 'appointment.no_show', 'appointment', p_appointment_id::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'no_show')
  );

  return jsonb_build_object('ok', true, 'status', 'no_show');
end;
$function$;
