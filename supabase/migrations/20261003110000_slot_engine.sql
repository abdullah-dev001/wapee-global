-- Phase 3, part 3: the slot calculation engine.
--
-- `get_free_slots(branch, service, staff, from_date, to_date)` -> free slots.
--
-- WHO MAY CALL IT
-- ---------------
-- Nobody, except `service_role`. EXECUTE is revoked from public, anon and
-- authenticated. The public booking page reaches it through an Edge Function
-- (`get_slots`) that resolves the business from the URL slug, checks the
-- business is active and the branch is bookable, and returns only the fields
-- the page needs.
--
-- The signature takes NO caller identity and performs NO permission check, on
-- purpose: it is pure availability maths. Phase 4's dashboard calls the same
-- function through a thin permission-checked wrapper
-- (`get_free_slots_for_member`, added in Phase 4), so there is exactly one
-- implementation of the rules and the two surfaces cannot drift apart.
--
-- THE RULES, in the order they are applied (doc §6.2)
-- ---------------------------------------------------
--  1. The branch is open      -> branch_hours for that weekday (no row = closed)
--  2. Not a holiday           -> branch_closures (inclusive date range)
--  3. The staff member works   -> staff_working_hours for that weekday
--  4. Minus their breaks      -> staff_breaks
--  5. Minus their time off    -> staff_time_off (real instants)
--  6. Minus existing bookings -> appointments, including each one's buffer
--  7. Buffer                  -> this booking's own trailing buffer must also fit
--  8. Minimum notice          -> no slot sooner than now + minimum_notice_minutes
--  9. Booking window          -> no slot later than today + booking_window_days
-- 10. Slot interval           -> candidates step by 15/30/60/service length
-- 11. Resources               -> when use_resources is on, a required resource
--                               must have spare capacity
-- 12. People per slot         -> a slot with people_per_slot > 1 stays offered
--                               until that many bookings exist
--
-- TIMEZONE AND DST — the part that is easy to get wrong
-- -----------------------------------------------------
-- Recurring hours are weekday + LOCAL minutes (Phase 2). A candidate slot is
-- built by taking the local calendar date, adding the local minute offset, and
-- converting to UTC **with the branch timezone**:
--
--     ((d::timestamp + make_interval(mins => m)) at time zone v_tz)
--
-- `timestamp at time zone 'Europe/London'` interprets a naive local time in
-- that zone and yields a timestamptz. This is what makes DST correct:
--
--  * **Spring forward** (Europe/London 2027-03-28 01:00 -> 02:00): the local
--    times 01:00–01:59 do not exist. Postgres maps them forward rather than
--    failing, so a 01:30 candidate becomes 02:30 BST. It is still inside the
--    day's working window when converted back, and the day simply has one hour
--    fewer of real time. No slot is duplicated.
--
--  * **Fall back** (2027-10-31 02:00 -> 01:00): the local times 01:00–01:59
--    happen twice. Postgres resolves the ambiguity to the SECOND occurrence,
--    i.e. standard time (verified: '2027-10-31 01:00'::timestamp at time zone
--    'Europe/London' = 01:00Z, which is GMT, not the 00:00Z BST reading).
--    Either way the hour is offered ONCE, not twice, which is the honest
--    answer: offering it twice would let two customers book "01:30" and arrive
--    an hour apart expecting the same slot.
--
--    The consequence worth knowing: on a fall-back day a branch open 09:00–17:00
--    local has 9 real hours of wall time but the engine still generates slots on
--    the local grid, so the repeated hour yields one set of slots. The second
--    (standard-time) pass of 01:00–01:59 is NOT offered. For a salon this is
--    invisible (nobody is open at 01:00); it is documented because a 24-hour
--    business would notice: the FIRST (daylight) pass of 01:00-01:59 is the one
--    not offered.
--
-- The date loop itself runs over LOCAL dates in the branch timezone, never over
-- UTC days, so "Tuesday" means Tuesday where the shop is.

-- ---------------------------------------------------------------------------
-- The return shape
-- ---------------------------------------------------------------------------
-- A composite type rather than an inline `returns table`, so the Phase 4
-- wrapper and the Edge Function share one definition.
create type public.free_slot as (
  -- UTC instant the appointment would start / end.
  starts_at timestamptz,
  ends_at timestamptz,
  -- The local calendar date in the branch timezone, so the page can group by
  -- day without redoing the conversion (and without getting it wrong — see the
  -- `timeZone: 'UTC'` trap in context/_handoff.md).
  local_date date,
  -- Local minutes from midnight, for "09:30" labels.
  local_minute integer,
  -- Which staff member this slot belongs to. Always set.
  staff_id uuid,
  -- The resource that would be used, when the branch uses resources.
  resource_id uuid,
  -- For people_per_slot > 1: how many places are left. 1 for a normal 1:1 slot.
  seats_left integer
);

comment on type public.free_slot is
  'One bookable slot. UTC instants plus the branch-local date/minute so the UI need not reconvert.';

-- ---------------------------------------------------------------------------
-- get_free_slots
-- ---------------------------------------------------------------------------
create or replace function public.get_free_slots(
  p_branch_id uuid,
  p_service_id uuid,
  -- NULL = "Any staff": every eligible staff member is considered and the
  -- caller gets one row per staff per slot. The booking RPC collapses that to
  -- one staff member using the least-loaded rule (pick_staff_for_slot below).
  p_staff_id uuid default null,
  -- LOCAL dates in the branch timezone. NULL from = today there.
  p_from_date date default null,
  p_to_date date default null,
  -- Phase 4 lets the dashboard see out-of-hours and inside-notice slots, which
  -- the public page must never do (doc §6.2 hard rule). Default = public
  -- behaviour, so forgetting the argument is safe.
  p_ignore_notice boolean default false
)
returns setof public.free_slot
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_tz text;
  v_duration integer;
  v_service_buffer integer;
  v_buffer integer;
  v_interval integer;
  v_notice integer;
  v_window integer;
  v_people integer;
  v_use_resources boolean;
  v_enabled boolean;
  v_from date;
  v_to date;
  v_today date;
  v_earliest timestamptz;
begin
  -- --- Branch, service and settings ---------------------------------------
  select b.business_id, b.timezone
    into v_business_id, v_tz
  from public.branches b
  where b.id = p_branch_id and b.deleted_at is null;

  if v_business_id is null then
    return;  -- unknown or deleted branch: no slots, no information leaked
  end if;

  select s.duration_minutes, s.buffer_minutes
    into v_duration, v_service_buffer
  from public.services s
  where s.id = p_service_id
    and s.business_id = v_business_id
    and s.deleted_at is null
    and s.is_active;

  if v_duration is null then
    return;  -- unknown, inactive or other-business service
  end if;

  -- The service must actually be offered at this branch (and be enabled there).
  if not exists (
    select 1 from public.service_branches sb
    where sb.service_id = p_service_id and sb.branch_id = p_branch_id and sb.enabled
  ) then
    return;
  end if;

  select bs.online_booking_enabled, bs.slot_interval, bs.buffer_minutes,
         bs.minimum_notice_minutes, bs.booking_window_days, bs.people_per_slot,
         bs.use_resources
    into v_enabled, v_interval, v_buffer, v_notice, v_window, v_people, v_use_resources
  from public.booking_settings bs
  where bs.branch_id = p_branch_id and bs.deleted_at is null;

  if v_enabled is null then
    return;  -- no settings row: treat as not bookable rather than guessing
  end if;

  -- `online_booking_enabled` is checked by the Edge Function too (so it can
  -- give the customer a reason). Checked here as well, because this function is
  -- the boundary that must not hand out slots for a closed branch.
  if not v_enabled and not p_ignore_notice then
    return;
  end if;

  -- The per-service buffer overrides the branch default when set.
  v_buffer := case when coalesce(v_service_buffer, 0) > 0 then v_service_buffer else v_buffer end;

  -- Slot interval. 'service_length' steps by the DURATION ONLY, not
  -- duration + buffer: the buffer is enforced as occupancy below, so a clean
  -- grid keeps a gap freed by a cancellation reachable.
  v_interval := case (v_interval::text)
    when 'min_15' then 15
    when 'min_30' then 30
    when 'min_60' then 60
    else v_duration
  end;

  -- --- The date range, in LOCAL dates -------------------------------------
  v_today := (now() at time zone v_tz)::date;
  v_from := greatest(coalesce(p_from_date, v_today), v_today);
  -- The booking window is the hard ceiling: a caller asking for next year gets
  -- nothing beyond it.
  v_to := least(
    coalesce(p_to_date, v_from + v_window),
    v_today + v_window
  );

  if v_to < v_from then
    return;
  end if;

  -- Minimum notice: the earliest instant a customer may book.
  v_earliest := case when p_ignore_notice then now()
                     else now() + make_interval(mins => v_notice) end;

  return query
  with
  -- Eligible staff: assigned to this branch, performs this service, active and
  -- bookable online. A specific p_staff_id narrows it to one.
  eligible_staff as (
    select sp.id as staff_id, sp.sort_order, sp.display_name
    from public.staff_profiles sp
    join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = p_branch_id
    join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = p_service_id
    where sp.business_id = v_business_id
      and sp.deleted_at is null
      and sp.is_active
      and sp.is_bookable_online
      and (p_staff_id is null or sp.id = p_staff_id)
  ),
  -- Every local date in range that is not a holiday.
  open_days as (
    select d::date as local_date
    from generate_series(v_from, v_to, interval '1 day') d
    where not exists (
      select 1 from public.branch_closures bc
      where bc.branch_id = p_branch_id
        -- Inclusive range (Phase 2 shape).
        and d::date between bc.starts_on and bc.ends_on
    )
  ),
  -- Rule 1: the branch's opening window(s) for that weekday. A weekday with no
  -- branch_hours row produces nothing, so the day is closed — which is why a
  -- branch whose hours have never been set has no slots at all.
  branch_windows as (
    select od.local_date, bh.start_minute, bh.end_minute
    from open_days od
    join public.branch_hours bh
      on bh.branch_id = p_branch_id
     -- Postgres `dow`: 0 = Sunday, matching the stored convention.
     and bh.day_of_week = extract(dow from od.local_date)::smallint
  ),
  -- Rule 3: intersected with the staff member's own hours. A staff member
  -- working 08:00–18:00 at a branch open 09:00–17:00 can only be booked
  -- 09:00–17:00, and vice versa.
  staff_windows as (
    select
      bw.local_date,
      es.staff_id,
      es.sort_order,
      greatest(bw.start_minute, wh.start_minute) as start_minute,
      least(bw.end_minute, wh.end_minute) as end_minute
    from branch_windows bw
    join eligible_staff es on true
    join public.staff_working_hours wh
      on wh.staff_id = es.staff_id
     and wh.branch_id = p_branch_id
     and wh.day_of_week = extract(dow from bw.local_date)::smallint
    where greatest(bw.start_minute, wh.start_minute) < least(bw.end_minute, wh.end_minute)
  ),
  -- Rule 10: candidate start minutes on the interval grid, anchored to the
  -- start of the window. The last candidate must leave room for the service.
  candidates as (
    select
      sw.local_date,
      sw.staff_id,
      sw.sort_order,
      m as local_minute,
      -- The naive local timestamp converted with the BRANCH timezone. This one
      -- expression is where DST correctness lives; see the header.
      ((sw.local_date::timestamp + make_interval(mins => m)) at time zone v_tz) as starts_at,
      ((sw.local_date::timestamp + make_interval(mins => m + v_duration)) at time zone v_tz) as ends_at,
      -- Rule 7: the slot's own trailing buffer must fit too, so a buffered
      -- service cannot be booked right at closing time.
      ((sw.local_date::timestamp + make_interval(mins => m + v_duration + v_buffer)) at time zone v_tz) as blocked_until
    from staff_windows sw
    cross join lateral generate_series(
      sw.start_minute,
      -- Leave room for the service itself. The buffer may run past closing
      -- (the shop is empty by then), so it is not subtracted here; doc §6.2
      -- only forbids out-of-hours SLOTS, not an after-hours tidy-up gap.
      sw.end_minute - v_duration,
      v_interval
    ) m
  ),
  -- Rules 4 and 5: drop candidates that collide with a break or time off.
  -- Rule 6: or with an existing appointment, counting that appointment's buffer
  -- as occupied time.
  available as (
    select c.*
    from candidates c
    where
      -- Rule 8: minimum notice.
      c.starts_at >= v_earliest
      -- Rule 4: breaks (local minutes, so compared on the local grid).
      and not exists (
        select 1 from public.staff_breaks br
        where br.staff_id = c.staff_id
          and br.branch_id = p_branch_id
          and br.day_of_week = extract(dow from c.local_date)::smallint
          -- '[)' both sides: a 12:00–13:00 break leaves 13:00 bookable.
          and int4range(br.start_minute, br.end_minute, '[)')
              && int4range(c.local_minute, c.local_minute + v_duration, '[)')
      )
      -- Rule 5: time off (real instants, so compared in UTC).
      and not exists (
        select 1 from public.staff_time_off t
        where t.staff_id = c.staff_id
          and (t.branch_id is null or t.branch_id = p_branch_id)
          and tstzrange(t.starts_at, t.ends_at, '[)')
              && tstzrange(c.starts_at, c.ends_at, '[)')
      )
      -- Rule 6: existing bookings. The EXISTING appointment's buffer is
      -- occupied, and so is THIS candidate's, so the comparison uses
      -- start .. end+buffer on both sides.
      and not exists (
        select 1 from public.appointments a
        where a.staff_id = c.staff_id
          and a.deleted_at is null
          and a.status not in ('cancelled', 'no_show')
          -- A group booking does not block its own slot for other customers;
          -- capacity is counted in `seats` below instead.
          and a.is_exclusive
          and tstzrange(a.starts_at, a.ends_at + make_interval(mins => a.buffer_minutes), '[)')
              && tstzrange(c.starts_at, c.blocked_until, '[)')
      )
  ),
  -- Rule 12: for people_per_slot > 1, how many places are already taken at
  -- exactly this start time with this staff member and service.
  seats as (
    select
      a.*,
      case
        when v_people <= 1 then 1
        else v_people - coalesce((
          select count(*)
          from public.appointments ap
          where ap.staff_id = a.staff_id
            and ap.service_id = p_service_id
            and ap.starts_at = a.starts_at
            and ap.deleted_at is null
            and ap.status not in ('cancelled', 'no_show')
        ), 0)::integer
      end as seats_left
    from available a
  ),
  -- Rule 11: resources. Only when the branch uses them AND the service needs
  -- one. A service with no service_resources row needs nothing and passes.
  resourced as (
    select
      s.*,
      case
        when not v_use_resources then null::uuid
        else (
          -- The first resource of a required kind with spare capacity.
          -- `capacity` lets one room hold several concurrent appointments.
          select r.id
          from public.service_resources sr
          join public.resources r on r.id = sr.resource_id
          where sr.service_id = p_service_id
            and r.branch_id = p_branch_id
            and r.deleted_at is null
            and r.is_active
            and r.capacity > coalesce((
              select count(*)
              from public.appointments ap
              where ap.resource_id = r.id
                and ap.deleted_at is null
                and ap.status not in ('cancelled', 'no_show')
                and tstzrange(ap.starts_at, ap.ends_at, '[)')
                    && tstzrange(s.starts_at, s.ends_at, '[)')
            ), 0)
          order by r.name, r.id
          limit 1
        )
      end as resource_id
    from seats s
  )
  select
    r.starts_at,
    r.ends_at,
    r.local_date,
    r.local_minute,
    r.staff_id,
    r.resource_id,
    r.seats_left
  from resourced r
  where r.seats_left > 0
    -- When resources are on and the service needs one, a slot with no free
    -- resource is not a slot (doc §6.2: "available only if staff and (if on)
    -- resource both free").
    and (
      not v_use_resources
      or r.resource_id is not null
      or not exists (
        select 1 from public.service_resources sr where sr.service_id = p_service_id
      )
    )
  order by r.starts_at, r.staff_id;
end;
$$;

comment on function public.get_free_slots is
  'Free slots for a branch+service (+optional staff) over a local date range. Applies branch hours, closures, staff hours, breaks, time off, bookings, buffer, notice, window, interval, resources and people-per-slot, all in the branch timezone. NO permission check: service_role only, called from the get_slots Edge Function. Phase 4 adds a permission-checked wrapper.';

-- ---------------------------------------------------------------------------
-- pick_staff_for_slot: the "Any staff" rule
-- ---------------------------------------------------------------------------
-- When the customer does not choose (staff_choice = optional with "Any staff",
-- or hidden), the booking RPC needs ONE staff member.
--
-- The rule, decided and documented: **the eligible staff member with the fewest
-- appointments that day at that branch; ties broken by `sort_order`, then by
-- `id`.** Fewest-first spreads the work rather than loading whoever happens to
-- sort first; sort_order lets the owner express a preference among equals; the
-- id makes it fully deterministic, so the same inputs always give the same
-- answer (which a test can assert).
--
-- "That day" is the LOCAL day at the branch, because that is the day the staff
-- member experiences.
create or replace function public.pick_staff_for_slot(
  p_branch_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_tz text;
  v_local_date date;
  v_staff_id uuid;
begin
  select b.business_id, b.timezone into v_business_id, v_tz
  from public.branches b
  where b.id = p_branch_id and b.deleted_at is null;

  if v_business_id is null then
    return null;
  end if;

  v_local_date := (p_starts_at at time zone v_tz)::date;

  select sp.id into v_staff_id
  from public.staff_profiles sp
  join public.staff_branches sb on sb.staff_id = sp.id and sb.branch_id = p_branch_id
  join public.service_staff ss on ss.staff_id = sp.id and ss.service_id = p_service_id
  where sp.business_id = v_business_id
    and sp.deleted_at is null
    and sp.is_active
    and sp.is_bookable_online
    -- They must actually be free for this exact window. Reusing the engine here
    -- would mean recomputing a whole day, so this is the narrow check: no
    -- overlapping exclusive appointment.
    and not exists (
      select 1 from public.appointments a
      where a.staff_id = sp.id
        and a.deleted_at is null
        and a.status not in ('cancelled', 'no_show')
        and a.is_exclusive
        and tstzrange(a.starts_at, a.ends_at + make_interval(mins => a.buffer_minutes), '[)')
            && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  order by
    -- 1. fewest appointments that LOCAL day at this branch
    (
      select count(*)
      from public.appointments a
      where a.staff_id = sp.id
        and a.branch_id = p_branch_id
        and a.deleted_at is null
        and a.status not in ('cancelled', 'no_show')
        and (a.starts_at at time zone v_tz)::date = v_local_date
    ) asc,
    -- 2. the owner's display order
    sp.sort_order asc,
    -- 3. deterministic tie-break
    sp.id asc
  limit 1;

  return v_staff_id;
end;
$$;

comment on function public.pick_staff_for_slot is
  'The "Any staff" rule: the free eligible staff member with the fewest appointments that LOCAL day at that branch; ties by sort_order, then id. Deterministic.';

-- ---------------------------------------------------------------------------
-- Grants: service_role only
-- ---------------------------------------------------------------------------
-- Supabase grants EXECUTE on a new public function to anon AND authenticated by
-- default, and `revoke ... from public` does NOT undo that. Revoke explicitly.
-- (See context/_handoff.md.)
revoke all on function public.get_free_slots(uuid, uuid, uuid, date, date, boolean) from public;
revoke execute on function public.get_free_slots(uuid, uuid, uuid, date, date, boolean) from anon, authenticated;
grant execute on function public.get_free_slots(uuid, uuid, uuid, date, date, boolean) to service_role;

revoke all on function public.pick_staff_for_slot(uuid, uuid, timestamptz, timestamptz) from public;
revoke execute on function public.pick_staff_for_slot(uuid, uuid, timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.pick_staff_for_slot(uuid, uuid, timestamptz, timestamptz) to service_role;
