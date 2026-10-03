-- Phase 3: get_free_slots gains `include_booked` and an `available` flag.
--
-- WHY
-- ---
-- doc §6.2 offers two slot displays: "only available" (the default) and "all
-- slots with booked ones greyed out". The engine could only do the first, so
-- the second was listed as an open decision in context/booking-engine.md.
--
-- WHAT CHANGED
-- ------------
-- * New parameter `p_include_booked boolean default false`. Default false, so
--   every existing caller behaves exactly as before.
-- * `free_slot` gains `available boolean`. With the default parameter every
--   returned row has `available = true`, so the old contract is a strict subset
--   of the new one.
-- * The occupancy checks (breaks, time off, existing bookings, seats,
--   resources) moved from WHERE filters to computed booleans, combined into one
--   `is_available` expression. There is now exactly ONE definition of
--   "bookable" in the function instead of the rule being split between a CTE
--   filter and the final WHERE.
--
-- WHAT DID NOT CHANGE
-- -------------------
-- The hard filters stay hard: branch closed, a holiday, the staff member not
-- working, outside the booking window, or inside the minimum notice all mean
-- the slot does not exist and is not returned even with p_include_booked.
-- doc §6.2 is explicit that online booking never shows out-of-hours slots, and
-- a greyed "20 minutes too late" row is noise.
--
-- PRIVACY
-- -------
-- A booked slot is returned with `available = false`, `resource_id` nulled and
-- nothing else about the booking: no client, no staff name beyond the staff_id
-- the caller already asked about, no status. The public Edge Function narrows
-- this further to `{ starts_at, available }`. A customer must never learn WHO
-- booked a slot.
--
-- `free_slot` is a composite type used in a function signature, so changing it
-- means dropping and recreating both. Done in one transaction.

-- Both functions depend on the type.
drop function if exists public.get_free_slots(uuid, uuid, uuid, date, date, boolean);
drop type if exists public.free_slot;

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
  -- The resource that would be used, when the branch uses resources. NULL on an
  -- unavailable slot.
  resource_id uuid,
  -- For people_per_slot > 1: how many places are left. 1 for a normal 1:1 slot.
  seats_left integer,
  -- FALSE only when p_include_booked asked for booked slots too. The page greys
  -- these; it never learns why they are taken.
  available boolean
);

comment on type public.free_slot is
  'One slot. UTC instants plus the branch-local date/minute, and `available` (false only when include_booked asked for booked slots).';

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
  p_ignore_notice boolean default false,
  -- doc §6.2 slot_display = 'all_greyed': return BOOKED slots too, each with
  -- `available = false`, so the page can grey them instead of hiding them.
  -- Default false = only free slots, so an existing caller is unaffected.
  p_include_booked boolean default false
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
  -- The stored enum and the resolved minute count are different things, so
  -- they get different variables: `select ... into` runs before the `case`
  -- below could convert anything.
  v_interval_mode public.slot_interval_mode;
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
    into v_enabled, v_interval_mode, v_buffer, v_notice, v_window, v_people, v_use_resources
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
  v_interval := case v_interval_mode
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
  -- Rules 4, 5 and 6 as FLAGS rather than filters.
  --
  -- The hard filters above (branch open, not a holiday, staff working, inside
  -- the booking window) decide whether a slot EXISTS at all. Occupancy decides
  -- whether it is BOOKABLE. With slot_display = 'all_greyed' the page wants the
  -- second kind returned rather than hidden, so each reason is computed as a
  -- boolean and the final WHERE drops them only when p_include_booked is false.
  --
  -- Minimum notice stays a hard filter even here: doc §6.2 is explicit that
  -- online booking never shows out-of-hours or too-soon slots, and a greyed
  -- "you were 20 minutes too late" row is noise, not information.
  available as (
    select
      c.*,
      -- Rule 4: breaks (local minutes, so compared on the local grid).
      exists (
        select 1 from public.staff_breaks br
        where br.staff_id = c.staff_id
          and br.branch_id = p_branch_id
          and br.day_of_week = extract(dow from c.local_date)::smallint
          -- '[)' both sides: a 12:00-13:00 break leaves 13:00 bookable.
          and int4range(br.start_minute, br.end_minute, '[)')
              && int4range(c.local_minute, c.local_minute + v_duration, '[)')
      ) as hits_break,
      -- Rule 5: time off (real instants, so compared in UTC).
      exists (
        select 1 from public.staff_time_off t
        where t.staff_id = c.staff_id
          and (t.branch_id is null or t.branch_id = p_branch_id)
          and tstzrange(t.starts_at, t.ends_at, '[)')
              && tstzrange(c.starts_at, c.ends_at, '[)')
      ) as hits_time_off,
      -- Rule 6: existing bookings. The EXISTING appointment's buffer is
      -- occupied, and so is THIS candidate's, so the comparison uses
      -- start .. end+buffer on both sides.
      exists (
        select 1 from public.appointments a
        where a.staff_id = c.staff_id
          and a.deleted_at is null
          and a.status not in ('cancelled', 'no_show')
          -- A group booking does not block its own slot for other customers;
          -- capacity is counted in `seats` below instead.
          and a.is_exclusive
          and tstzrange(a.starts_at, a.ends_at + make_interval(mins => a.buffer_minutes), '[)')
              && tstzrange(c.starts_at, c.blocked_until, '[)')
      ) as hits_booking
    from candidates c
    -- Rule 8: minimum notice. Still a hard filter, deliberately (see above).
    where c.starts_at >= v_earliest
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
    -- A booked slot has no resource to report.
    case when r.is_available then r.resource_id else null end,
    r.seats_left,
    r.is_available
  from (
    select
      rc.*,
      -- The single definition of "bookable": nothing occupies it, a seat is
      -- left, and (if the branch uses resources and the service needs one) a
      -- resource is free. doc §6.2: "available only if staff and (if on)
      -- resource both free".
      (
        not rc.hits_break
        and not rc.hits_time_off
        and not rc.hits_booking
        and rc.seats_left > 0
        and (
          not v_use_resources
          or rc.resource_id is not null
          or not exists (
            select 1 from public.service_resources sr where sr.service_id = p_service_id
          )
        )
      ) as is_available
    from resourced rc
  ) r
  -- The default contract is unchanged: free slots only. p_include_booked keeps
  -- the unavailable ones so the page can grey them.
  where p_include_booked or r.is_available
  order by r.starts_at, r.staff_id;
end;
$$;

comment on function public.get_free_slots is
  'Slots for a branch+service (+optional staff) over a local date range. Applies branch hours, closures, staff hours, breaks, time off, bookings, buffer, notice, window, interval, resources and people-per-slot, all in the branch timezone. p_include_booked adds booked slots with available=false (doc §6.2 all_greyed). NO permission check: service_role only, called from the get_slots Edge Function.';

-- Supabase grants EXECUTE on a new public function to anon AND authenticated by
-- default, and `revoke ... from public` does NOT undo that. Revoke explicitly.
revoke all on function public.get_free_slots(uuid, uuid, uuid, date, date, boolean, boolean) from public;
revoke execute on function public.get_free_slots(uuid, uuid, uuid, date, date, boolean, boolean) from anon, authenticated;
grant execute on function public.get_free_slots(uuid, uuid, uuid, date, date, boolean, boolean) to service_role;
