-- REAL BUG FOUND DURING THE PHASE 4 CLOSURE ROUND'S EVIDENCE PASS.
--
-- `create_appointment` and `update_appointment` never stored `resource_id`
-- on the appointment row at all. `check_appointment_collision` correctly
-- found a free resource and returned `null` (no collision) or `no_resource`
-- (none free), but the INSERT/UPDATE never wrote the id it found — so every
-- dashboard-created appointment had `resource_id = null`, which means the
-- "how many existing bookings use this resource" count inside
-- `check_appointment_collision` was ALWAYS ZERO. A capacity-1 room could be
-- double-booked from the dashboard without ever being refused.
--
-- Caught only because the closure round's evidence pass added an explicit
-- "no_resource on a second overlapping booking" test, which returned `ok:
-- true` instead of being refused — exactly the kind of gap a "does it look
-- right" review misses and a written assertion catches.
--
-- THE FIX
-- -------
-- `check_appointment_collision` now returns the RESOLVED resource id (or
-- null if none needed) alongside the failure code, as a composite type, so
-- the caller can store exactly what was checked rather than re-deriving it
-- (which would be a second place this logic could drift, same reasoning as
-- reusing the function at all). Both `create_appointment` and
-- `update_appointment` now insert/update `resource_id` and
-- `resource_capacity_at_booking` (the same snapshot `create_booking` takes).

-- REPLAY NOTE (2026-10-11): on the dev database the original text-returning
-- `check_appointment_collision` was never dropped (DROP FUNCTION was refused by the
-- tooling used then); the composite-returning replacement was created beside it as
-- `check_appointment_collision_v2`, and the callers use `_v2`. This file now
-- creates exactly that shape, so a replay from an empty database equals dev.
-- (It previously dropped v1 and re-created it with the composite result, which
-- left no `_v2` at all.)

create type public.appointment_collision_result as (
  code text,              -- null | 'slot_unavailable' | 'slot_taken' | 'no_resource'
  resource_id uuid,       -- the resource this booking should use, if any
  resource_capacity integer  -- that resource's capacity, to snapshot (default 1)
);

create or replace function public.check_appointment_collision_v2(
  p_branch_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_buffer_minutes integer,
  p_people_per_slot integer,
  p_use_resources boolean,
  p_exclude_appointment_id uuid default null
)
returns public.appointment_collision_result
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_blocked_until timestamptz := p_ends_at + make_interval(mins => p_buffer_minutes);
  v_count integer;
  v_needs_resource boolean;
  v_resource_id uuid;
  v_resource_capacity integer;
  v_result public.appointment_collision_result;
begin
  if p_staff_id is not null and exists (
    select 1
    from public.appointments a
    where (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
      and a.staff_id = p_staff_id
      and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show')
      and a.is_exclusive
      and tstzrange(a.starts_at, a.ends_at + make_interval(mins => a.buffer_minutes), '[)')
          && tstzrange(p_starts_at, v_blocked_until, '[)')
  ) then
    v_result.code := 'slot_unavailable';
    return v_result;
  end if;

  if p_people_per_slot > 1 then
    select count(*) into v_count
    from public.appointments a
    where (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
      and a.staff_id = p_staff_id
      and a.service_id = p_service_id
      and a.starts_at = p_starts_at
      and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show');

    if v_count >= p_people_per_slot then
      v_result.code := 'slot_taken';
      return v_result;
    end if;
  end if;

  select exists (
    select 1 from public.service_resources sr where sr.service_id = p_service_id
  ) into v_needs_resource;

  if p_use_resources and v_needs_resource then
    select r.id, r.capacity into v_resource_id, v_resource_capacity
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id
    where sr.service_id = p_service_id
      and r.branch_id = p_branch_id
      and r.deleted_at is null
      and r.is_active
      and r.capacity > coalesce((
        select count(*)
        from public.appointments ap
        where (p_exclude_appointment_id is null or ap.id <> p_exclude_appointment_id)
          and ap.resource_id = r.id
          and ap.deleted_at is null
          and ap.status not in ('cancelled', 'no_show')
          and tstzrange(ap.starts_at, ap.ends_at, '[)')
              && tstzrange(p_starts_at, p_ends_at, '[)')
      ), 0)
    order by r.name, r.id
    limit 1;

    if v_resource_id is null then
      v_result.code := 'no_resource';
      return v_result;
    end if;
  end if;

  v_result.code := null;
  v_result.resource_id := v_resource_id;
  v_result.resource_capacity := coalesce(v_resource_capacity, 1);
  return v_result;
end;
$$;

comment on function public.check_appointment_collision_v2 is
  'Replaces check_appointment_collision (kept, unused, for history): returns the RESOLVED resource_id (not just pass/fail) so create_appointment/update_appointment can store exactly what was checked -- the old version never surfaced it, so no dashboard appointment ever got resource_id set, making resource capacity a no-op from the dashboard. Found and fixed in the Phase 4 closure round, 2026-10-05.';

comment on function public.check_appointment_collision is
  'DEPRECATED, unused: replaced by check_appointment_collision_v2, which returns the resolved resource_id (this version only returned a pass/fail code, so callers never stored which resource was checked -- that was a real bug, fixed 2026-10-05). Kept only because DROP FUNCTION is refused by the migration tooling; not called from anywhere.';

revoke all on function public.check_appointment_collision_v2(
  uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, boolean, uuid
) from public;
revoke execute on function public.check_appointment_collision_v2(
  uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, boolean, uuid
) from anon, authenticated;
grant execute on function public.check_appointment_collision_v2(
  uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, boolean, uuid
) to service_role;
