-- update_appointment: use check_appointment_collision_v2 and STORE resource_id.
--
-- Same bug and fix as 20261004045754 (create_appointment): the version in
-- 20261004043110 never wrote resource_id / resource_capacity_at_booking.
--
-- REPLAY FIX (2026-10-11): this file used to be a no-op placeholder; the fixed
-- definition existed only on the dev database. The definition below is dev's,
-- verbatim. On dev it is already recorded as applied (nothing re-runs there).
create or replace function public.update_appointment(
  p_appointment_id uuid,
  p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_staff_id uuid DEFAULT NULL::uuid,
  p_client_notes text DEFAULT NULL::text,
  p_internal_notes text DEFAULT NULL::text,
  p_clear_client_notes boolean DEFAULT false,
  p_clear_internal_notes boolean DEFAULT false
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row record;
  v_new_starts_at timestamptz;
  v_new_staff_id uuid;
  v_ends_at timestamptz;
  v_buffer integer;
  v_people integer;
  v_use_resources boolean;
  v_collision public.appointment_collision_result;
begin
  select
    a.id, a.business_id, a.branch_id, a.service_id, a.staff_id,
    a.starts_at, a.ends_at, a.duration_minutes, a.status,
    s.buffer_minutes as service_buffer, s.name as service_name
  into v_row
  from public.appointments a
  join public.services s on s.id = a.service_id
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
    if p_staff_id is not null and p_staff_id <> v_row.staff_id
       and not public.is_own_staff_profile(p_staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;

  if v_row.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'not_editable', 'status', v_row.status);
  end if;

  v_new_starts_at := coalesce(p_starts_at, v_row.starts_at);
  v_new_staff_id := coalesce(p_staff_id, v_row.staff_id);

  if v_new_starts_at = v_row.starts_at and v_new_staff_id = v_row.staff_id then
    update public.appointments a
    set client_notes = case
          when p_clear_client_notes then null
          when p_client_notes is not null then nullif(btrim(p_client_notes), '')
          else a.client_notes
        end,
        internal_notes = case
          when p_clear_internal_notes then null
          when p_internal_notes is not null then nullif(btrim(p_internal_notes), '')
          else a.internal_notes
        end
    where a.id = p_appointment_id;

    return jsonb_build_object('ok', true, 'status', v_row.status, 'starts_at', v_row.starts_at, 'staff_id', v_new_staff_id);
  end if;

  select bs.buffer_minutes, bs.people_per_slot, bs.use_resources
    into v_buffer, v_people, v_use_resources
  from public.booking_settings bs
  where bs.branch_id = v_row.branch_id;

  v_buffer := case when coalesce(v_row.service_buffer, 0) > 0 then v_row.service_buffer else v_buffer end;
  v_ends_at := v_new_starts_at + make_interval(mins => v_row.duration_minutes);

  if v_new_staff_id is not null and not exists (
    select 1
    from public.staff_profiles sp
    join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = v_row.branch_id
    join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = v_row.service_id
    where sp.id = v_new_staff_id and sp.business_id = v_row.business_id
      and sp.deleted_at is null and sp.is_active
  ) then
    return jsonb_build_object('ok', false, 'code', 'staff_unavailable');
  end if;

  perform pg_advisory_xact_lock(
    hashtext('booking:' || v_row.branch_id::text || ':' || v_row.service_id::text),
    hashtext(v_new_starts_at::text)
  );

  v_collision := public.check_appointment_collision_v2(
    v_row.branch_id, v_row.service_id, v_new_staff_id, v_new_starts_at, v_ends_at,
    v_buffer, v_people, v_use_resources,
    p_exclude_appointment_id => p_appointment_id
  );
  if v_collision.code is not null then
    return jsonb_build_object('ok', false, 'code', v_collision.code);
  end if;

  begin
    update public.appointments a
    set starts_at = v_new_starts_at,
        ends_at = v_ends_at,
        staff_id = v_new_staff_id,
        resource_id = v_collision.resource_id,
        resource_capacity_at_booking = coalesce(v_collision.resource_capacity, 1),
        buffer_minutes = v_buffer,
        client_notes = case
          when p_clear_client_notes then null
          when p_client_notes is not null then nullif(btrim(p_client_notes), '')
          else a.client_notes
        end,
        internal_notes = case
          when p_clear_internal_notes then null
          when p_internal_notes is not null then nullif(btrim(p_internal_notes), '')
          else a.internal_notes
        end
    where a.id = p_appointment_id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end;

  perform public.write_audit_log(
    v_row.business_id, 'appointment.rescheduled', 'appointment', p_appointment_id::text,
    jsonb_build_object('starts_at', v_row.starts_at, 'staff_id', v_row.staff_id),
    jsonb_build_object('starts_at', v_new_starts_at, 'staff_id', v_new_staff_id)
  );

  return jsonb_build_object(
    'ok', true, 'status', v_row.status, 'starts_at', v_new_starts_at,
    'ends_at', v_ends_at, 'staff_id', v_new_staff_id
  );
end;
$function$;

comment on function public.update_appointment is
  'Dashboard edit/reschedule. Validates fully (collision check with its own row excluded) before a single UPDATE. check_appointment_collision_v2 resolves AND the update stores resource_id/resource_capacity_at_booking (the original version never stored it -- bug found and fixed 2026-10-05). Terminal statuses are not editable at all. SECURITY DEFINER, explicit can()/scope check as the boundary.';
