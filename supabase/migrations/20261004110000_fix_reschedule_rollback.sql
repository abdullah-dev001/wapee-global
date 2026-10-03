-- Fix: a FAILED reschedule left the appointment cancelled.
--
-- THE BUG
-- -------
-- `reschedule_booking` freed the old slot first:
--
--   update appointments set status = 'cancelled' ... ;   -- "so the slot is free"
--   ... validate the new slot ...
--   if bad then return jsonb_build_object('ok', false, ...);   -- <-- BUG
--
-- The comment claimed the RETURN would roll that update back. **It does not.**
-- A `RETURN` ends the function normally and its work is committed with the
-- caller's transaction; only an exception discards it. So every failure path —
-- out of hours, too soon, outside the window, slot taken, same_slot, no staff —
-- **cancelled the customer's booking and then told them the reschedule failed.**
--
-- A guest tapping a slot that had just gone would have lost their appointment.
-- Caught by the one assertion that checked the original survived a failed
-- attempt, which is why that assertion exists.
--
-- THE FIX, in two parts
-- --------------------
-- 1. **Do not free the slot to validate.** The reason it was freed at all was
--    that an appointment's own row blocks its new time when the windows overlap
--    (moving 10:00 -> 10:30). That is now handled by checking the collision
--    directly and EXCLUDING THIS APPOINTMENT (`a.id <> v_id`), instead of
--    mutating a row to make a query come out right.
--
--    This also means `get_free_slots` is no longer the re-check for a
--    reschedule: it cannot express "ignore this one appointment". The engine
--    stays the authority on the slot GRID (hours, closures, breaks, time off,
--    notice, window, interval), and the overlap test is done here with the
--    exclusion. The buffer rule is applied exactly as the engine applies it.
--
-- 2. **Mutate only once everything has passed**, as a single UPDATE. There is
--    then no window in which the booking is cancelled-but-not-moved, and no
--    failure path that has anything to undo.
--
-- The advisory lock still covers the whole validate-then-write section, so a
-- reschedule and a fresh booking competing for one slot serialise.

create or replace function public.reschedule_booking(
  p_token text,
  p_starts_at timestamptz,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row record;
  v_cutoff timestamptz;
  v_tz text;
  v_duration integer;
  v_buffer integer;
  v_ends_at timestamptz;
  v_blocked_until timestamptz;
  v_local_date date;
  v_local_minute integer;
  v_today date;
  v_staff_id uuid;
  v_staff_name text;
  v_resource_id uuid;
  v_resource_capacity integer := 1;
  v_needs_resource boolean;
  v_count integer;
  v_new_status public.appointment_status;
begin
  v_id := public.resolve_manage_token(p_token);
  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select
    a.id, a.status, a.starts_at, a.business_id, a.branch_id, a.service_id,
    a.staff_id, a.duration_minutes,
    br.timezone,
    bs.customer_can_cancel, bs.cancel_cutoff_hours, bs.confirmation,
    bs.minimum_notice_minutes, bs.booking_window_days, bs.people_per_slot,
    bs.use_resources, bs.buffer_minutes as branch_buffer, bs.online_booking_enabled,
    s.buffer_minutes as service_buffer, s.name as service_name
  into v_row
  from public.appointments a
  join public.branches br on br.id = a.branch_id
  join public.booking_settings bs on bs.branch_id = a.branch_id
  join public.services s on s.id = a.service_id
  where a.id = v_id
  for update of a;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  if v_row.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable', 'status', v_row.status);
  end if;

  if not public.business_is_active(v_row.business_id) or not v_row.online_booking_enabled then
    return jsonb_build_object('ok', false, 'code', 'not_bookable');
  end if;

  if not v_row.customer_can_cancel then
    return jsonb_build_object('ok', false, 'code', 'cancel_not_allowed');
  end if;

  v_cutoff := v_row.starts_at - make_interval(hours => v_row.cancel_cutoff_hours);
  if now() >= v_cutoff then
    return jsonb_build_object('ok', false, 'code', 'cancel_window_passed',
                              'cutoff_hours', v_row.cancel_cutoff_hours);
  end if;

  v_tz := v_row.timezone;
  v_duration := v_row.duration_minutes;
  v_buffer := case when coalesce(v_row.service_buffer, 0) > 0
                   then v_row.service_buffer else v_row.branch_buffer end;
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  v_blocked_until := v_ends_at + make_interval(mins => v_buffer);
  v_local_date := (p_starts_at at time zone v_tz)::date;
  v_local_minute := extract(hour from (p_starts_at at time zone v_tz))::integer * 60
                  + extract(minute from (p_starts_at at time zone v_tz))::integer;
  v_today := (now() at time zone v_tz)::date;

  if p_starts_at = v_row.starts_at
     and coalesce(p_staff_id, v_row.staff_id) = v_row.staff_id then
    return jsonb_build_object('ok', false, 'code', 'same_slot');
  end if;

  if p_starts_at < now() + make_interval(mins => v_row.minimum_notice_minutes) then
    return jsonb_build_object('ok', false, 'code', 'too_soon');
  end if;
  if v_local_date > v_today + v_row.booking_window_days then
    return jsonb_build_object('ok', false, 'code', 'outside_window');
  end if;

  -- The same lock key create_booking uses, so the two serialise per slot.
  perform pg_advisory_xact_lock(
    hashtext('booking:' || v_row.branch_id::text || ':' || v_row.service_id::text),
    hashtext(p_starts_at::text)
  );

  -- --- Staff ------------------------------------------------------------
  v_staff_id := coalesce(p_staff_id, v_row.staff_id);

  if v_staff_id is not null and not exists (
    select 1
    from public.staff_profiles sp
    join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = v_row.branch_id
    join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = v_row.service_id
    where sp.id = v_staff_id
      and sp.deleted_at is null and sp.is_active and sp.is_bookable_online
  ) then
    v_staff_id := null;  -- no longer eligible; fall through to "any staff"
  end if;

  if v_staff_id is null then
    v_staff_id := public.pick_staff_for_slot(
      v_row.branch_id, v_row.service_id, p_starts_at, v_blocked_until);
    if v_staff_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_staff');
    end if;
  end if;

  -- --- Is the new time on the slot GRID at all? -------------------------
  -- The engine owns branch hours, closures, staff hours, breaks, time off, the
  -- interval, notice and window. It cannot express "ignore this one
  -- appointment", so it is asked with `p_include_booked`, and the occupancy
  -- question is answered separately below with the appointment excluded.
  if not exists (
    select 1
    from public.get_free_slots(v_row.branch_id, v_row.service_id, v_staff_id,
                               v_local_date, v_local_date, false, true)
    where starts_at = p_starts_at
  ) then
    -- Not a slot at all: closed, a holiday, out of hours, off the interval grid,
    -- or the staff member is not working then.
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end if;

  -- --- Is anyone else in the way? ---------------------------------------
  -- THIS is where the old code mutated the row to get the right answer. The
  -- exclusion `a.id <> v_id` does the same job honestly: the appointment being
  -- moved does not block itself.
  --
  -- Buffers are applied on both sides exactly as the engine applies them: the
  -- existing appointment occupies start..end+its buffer, and this one would
  -- occupy start..end+its buffer.
  if exists (
    select 1
    from public.appointments a
    where a.id <> v_id
      and a.staff_id = v_staff_id
      and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show')
      and a.is_exclusive
      and tstzrange(a.starts_at, a.ends_at + make_interval(mins => a.buffer_minutes), '[)')
          && tstzrange(p_starts_at, v_blocked_until, '[)')
  ) then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end if;

  -- --- Group capacity (this appointment excluded) ------------------------
  if v_row.people_per_slot > 1 then
    select count(*) into v_count
    from public.appointments a
    where a.id <> v_id
      and a.staff_id = v_staff_id
      and a.service_id = v_row.service_id
      and a.starts_at = p_starts_at
      and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show');

    if v_count >= v_row.people_per_slot then
      return jsonb_build_object('ok', false, 'code', 'slot_taken');
    end if;
  end if;

  -- --- Resource (this appointment excluded) -----------------------------
  select exists (
    select 1 from public.service_resources sr where sr.service_id = v_row.service_id
  ) into v_needs_resource;

  if v_row.use_resources and v_needs_resource then
    select r.id, r.capacity into v_resource_id, v_resource_capacity
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id
    where sr.service_id = v_row.service_id
      and r.branch_id = v_row.branch_id
      and r.deleted_at is null
      and r.is_active
      and r.capacity > coalesce((
        select count(*)
        from public.appointments ap
        where ap.id <> v_id
          and ap.resource_id = r.id
          and ap.deleted_at is null
          and ap.status not in ('cancelled', 'no_show')
          and tstzrange(ap.starts_at, ap.ends_at, '[)')
              && tstzrange(p_starts_at, v_ends_at, '[)')
      ), 0)
    order by r.name, r.id
    limit 1;

    if v_resource_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_resource');
    end if;
  end if;

  -- =========================================================================
  -- Everything passed. ONE update, so there is no window in which the booking
  -- is cancelled-but-not-moved and no failure path with anything to undo.
  -- =========================================================================
  -- Back to 'pending' when the owner approves bookings: they agreed to a time,
  -- not to any time (agreed with the user, 2026-10-03).
  v_new_status := case when v_row.confirmation = 'manual' then 'pending' else 'confirmed' end;

  begin
    update public.appointments
    set starts_at = p_starts_at,
        ends_at = v_ends_at,
        staff_id = v_staff_id,
        resource_id = v_resource_id,
        resource_capacity_at_booking =
          case when v_resource_id is null then 1 else coalesce(v_resource_capacity, 1) end,
        buffer_minutes = v_buffer,
        status = v_new_status,
        cancelled_at = null,
        cancelled_by_guest = false,
        cancellation_reason = null
    where id = v_id;
  exception when exclusion_violation then
    -- The constraint is the last line of defence, as in create_booking. Reaching
    -- it means another transaction committed between the checks and this update.
    return jsonb_build_object('ok', false, 'code', 'slot_taken');
  end;

  select sp.display_name into v_staff_name
  from public.staff_profiles sp where sp.id = v_staff_id;

  -- The existing token keeps working; only its expiry follows the appointment.
  -- Re-issuing would kill the link in the email the customer is reading.
  update public.booking_manage_tokens
  set expires_at = v_ends_at
  where appointment_id = v_id and revoked_at is null;

  return jsonb_build_object(
    'ok', true,
    'status', v_new_status,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'timezone', v_tz,
    'local_date', v_local_date,
    'local_minute', v_local_minute,
    'service_name', v_row.service_name,
    'staff_name', v_staff_name,
    'needs_approval', v_new_status = 'pending'
  );
end;
$$;

comment on function public.reschedule_booking is
  'Guest reschedule by raw token. Validates EVERYTHING before touching the row, then moves it in one UPDATE, under the same advisory lock as create_booking. The appointment is excluded from its own collision checks (a.id <> v_id) rather than being cancelled to make a query come out right. Goes back to pending when confirmation = manual. Returns {ok:false,code} and never raises.';

revoke all on function public.reschedule_booking(text, timestamptz, uuid) from public;
revoke execute on function public.reschedule_booking(text, timestamptz, uuid) from anon, authenticated;
grant execute on function public.reschedule_booking(text, timestamptz, uuid) to service_role;
