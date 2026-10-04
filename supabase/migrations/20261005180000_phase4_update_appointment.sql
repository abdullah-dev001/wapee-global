-- Phase 4 part A: update/reschedule_appointment.
--
-- Same posture as create_appointment: SECURITY DEFINER, explicit can()/scope
-- check as the boundary, collision-only availability (no hours/notice/
-- window), the SAME pg_advisory_xact_lock key as create_booking/
-- reschedule_booking/create_appointment so all four paths serialise against
-- each other for one slot.
--
-- VALIDATE EVERYTHING, MUTATE ONCE. The bug class this file must not repeat:
-- `reschedule_booking` once freed the old slot FIRST and then validated,
-- so every failure path left the booking cancelled (a RETURN does not roll
-- back). This function validates fully, including the collision check with
-- its own row EXCLUDED (`a.id <> v_id`), and only then does ONE update.
create or replace function public.update_appointment(
  p_appointment_id uuid,
  -- NULL means "leave unchanged" for each of these, so a caller can move
  -- only the time, or only add a note, without resending everything.
  p_starts_at timestamptz default null,
  p_staff_id uuid default null,
  p_client_notes text default null,
  p_internal_notes text default null,
  -- Explicit flags because NULL already means "leave unchanged" for the
  -- notes fields above; a caller wanting to CLEAR a note sets these true.
  p_clear_client_notes boolean default false,
  p_clear_internal_notes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_new_starts_at timestamptz;
  v_new_staff_id uuid;
  v_ends_at timestamptz;
  v_buffer integer;
  v_people integer;
  v_use_resources boolean;
  v_collision text;
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
    -- An Own-scope caller moving themselves to someone else is not "their
    -- own appointment" any more; refuse rather than silently keep the old
    -- staff_id, which would contradict what the caller asked for.
    if p_staff_id is not null and p_staff_id <> v_row.staff_id
       and not public.is_own_staff_profile(p_staff_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  end if;

  -- Terminal statuses are not editable at all — not even notes — same "no
  -- reopen, ever" rule as the status RPCs below, applied uniformly.
  if v_row.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'not_editable', 'status', v_row.status);
  end if;

  v_new_starts_at := coalesce(p_starts_at, v_row.starts_at);
  v_new_staff_id := coalesce(p_staff_id, v_row.staff_id);

  -- Notes-only edit: skip the whole reschedule/collision path.
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

  -- =========================================================================
  -- Reschedule path: validate fully, mutate once.
  -- =========================================================================
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

  v_collision := public.check_appointment_collision(
    v_row.branch_id, v_row.service_id, v_new_staff_id, v_new_starts_at, v_ends_at,
    v_buffer, v_people, v_use_resources,
    p_exclude_appointment_id => p_appointment_id
  );
  if v_collision is not null then
    return jsonb_build_object('ok', false, 'code', v_collision);
  end if;

  begin
    update public.appointments a
    set starts_at = v_new_starts_at,
        ends_at = v_ends_at,
        staff_id = v_new_staff_id,
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
$$;

comment on function public.update_appointment is
  'Dashboard edit/reschedule. Validates fully (collision check with its own row excluded) before a single UPDATE -- the reschedule_booking rollback bug must never recur. Terminal statuses are not editable at all. SECURITY DEFINER, explicit can()/scope check as the boundary.';

revoke all on function public.update_appointment(
  uuid, timestamptz, uuid, text, text, boolean, boolean
) from public;
revoke execute on function public.update_appointment(
  uuid, timestamptz, uuid, text, text, boolean, boolean
) from anon;
grant execute on function public.update_appointment(
  uuid, timestamptz, uuid, text, text, boolean, boolean
) to authenticated;
