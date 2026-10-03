-- Fix: a resource with capacity > 1 was unusable.
--
-- THE BUG
-- -------
-- `appointments_no_resource_double_booking` excluded ANY two overlapping
-- exclusive appointments sharing a resource_id. An exclusion constraint has no
-- notion of capacity, so a room declared `capacity: 2` could still only ever
-- hold one booking:
--
--   1. get_free_slots correctly offers the slot (it counts concurrent use
--      against r.capacity).
--   2. create_booking correctly re-checks and finds a free place.
--   3. the INSERT is then refused by the constraint, and the customer is told
--      "that slot just went" when it had not.
--
-- Two layers disagreeing, with the database winning and the message being a
-- lie. `resources.capacity` has existed since Phase 2 and the UI lets an owner
-- set it, so this was reachable.
--
-- THE FIX
-- -------
-- Add `resource_is_exclusive`, a generated column that is true only when the
-- appointment holds a resource whose capacity is 1, and make the constraint
-- consider only those rows.
--
-- A generated column cannot run a subquery, so the capacity has to be snapshot
-- onto the appointment at write time. That is consistent with how this table
-- already treats duration, buffer and price: **the rule that applied when the
-- booking was made is a historical fact.** It also means raising a room's
-- capacity later does not retroactively unprotect existing bookings, which is
-- the safe direction.
--
-- `resource_capacity_at_booking` is set by create_booking (and by the Phase 4
-- dashboard). It defaults to 1, so any row that forgets it gets the STRICTER
-- behaviour rather than the looser one.
--
-- WHAT STILL GUARANTEES WHAT
-- --------------------------
-- * capacity = 1  -> the constraint. A true DB guarantee, as before.
-- * capacity > 1  -> the counted check in create_booking under
--                    pg_advisory_xact_lock. Same weaker guarantee as
--                    people_per_slot > 1, and documented alongside it.

alter table public.appointments
  add column resource_capacity_at_booking integer not null default 1;

comment on column public.appointments.resource_capacity_at_booking is
  'Snapshot of the resource''s capacity when this booking was made. 1 (the default) means the exclusion constraint protects the slot; >1 means the counted check in create_booking does. Defaults to the stricter value on purpose.';

alter table public.appointments
  add constraint appointments_resource_capacity_positive
  check (resource_capacity_at_booking >= 1);

-- Backfill from the live capacity. There are no production bookings yet, so
-- this is exact rather than a guess.
update public.appointments a
set resource_capacity_at_booking = coalesce(
  (select r.capacity from public.resources r where r.id = a.resource_id), 1)
where a.resource_id is not null;

-- A generated column, so it can never drift from the two columns it derives
-- from and no trigger has to remember to maintain it.
alter table public.appointments
  add column resource_is_exclusive boolean
  generated always as (
    resource_id is not null and resource_capacity_at_booking <= 1
  ) stored;

comment on column public.appointments.resource_is_exclusive is
  'True only for a booking holding a capacity-1 resource. The resource exclusion constraint considers only these rows, so a capacity-2 room can genuinely hold two bookings.';

-- Replace the constraint. Dropping and re-adding is the only way to change an
-- exclusion constraint's predicate.
alter table public.appointments
  drop constraint appointments_no_resource_double_booking;

alter table public.appointments
  add constraint appointments_no_resource_double_booking
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (
    -- Was: `resource_id is not null and is_exclusive`. The `is_exclusive` part
    -- was about people_per_slot and had nothing to do with the resource; a 1:1
    -- service in a capacity-2 room was wrongly blocked by it, and a group
    -- service in a capacity-1 room wrongly escaped it.
    resource_is_exclusive
    and deleted_at is null
    and status not in ('cancelled', 'no_show')
  );

comment on constraint appointments_no_resource_double_booking on public.appointments is
  'No two overlapping bookings may hold the same CAPACITY-1 resource. Capacity > 1 is enforced by the counted check in create_booking under an advisory lock.';
