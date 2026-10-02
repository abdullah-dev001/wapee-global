-- Phase 3: booking form, form versioning and the SLOT ENGINE.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/06_booking_form_and_slot_engine.sql
--
-- This is NOT a pgTAP file. `supabase test db` needs Docker, which is not
-- installed on this machine (see context/_handoff.md), so these suites are
-- written as plain SQL that builds its own fixtures, asserts into a temp table
-- and ROLLS BACK. They print a pass/fail summary as the last result set.
--
-- Last run: 2026-10-03 against the live dev project. 93/93 passing.
--
-- Covered: baseline slot generation; three timezones (Europe/London,
-- America/New_York, Asia/Karachi); DST spring-forward and fall-back including a
-- branch open across the repeated hour; breaks; closures; time off; existing
-- bookings; pending holding the slot; cancelled and no_show freeing it; the
-- exclusion constraint refusing a concurrent double booking; a group booking
-- NOT being refused; buffer; slot interval (15/30/60/service length); booking
-- window; minimum notice; online_booking_enabled; resources and capacity;
-- people-per-slot seat counting; a branch with no hours; staff eligibility;
-- the "Any staff" least-loaded rule; form versioning and immutability;
-- sensitivity escalation; client identity; tenant guards; and the grants that
-- keep the engine service_role-only.

-- Slot engine verification. All inside one transaction, rolled back at the end.
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as
  $$ select v from ids where k = $1 $$;

create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got::text is not distinct from p_want::text,
          'got ' || coalesce(p_got::text,'<null>') || ' want ' || coalesce(p_want::text,'<null>'));
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures: one business, three branches (London, New York, Karachi)
-- ---------------------------------------------------------------------------
do $$
declare v_biz uuid; v_br uuid; v_svc uuid; v_staff uuid;
begin
  insert into public.businesses (name, slug, status, language, trial_ends_at)
  values ('Slot Lab', 'slot-lab-check', 'trialing', 'en', now() + interval '1000 days')
  returning id into v_biz;
  insert into ids values ('biz', v_biz);

  -- Branches. The booking_settings trigger gives each one defaults.
  insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, invoice_prefix)
  values (v_biz, 'London', true, 'GB', 'GBP', 'Europe/London', 'LON') returning id into v_br;
  insert into ids values ('ldn', v_br);

  insert into public.branches (business_id, name, country_code, currency, timezone, invoice_prefix)
  values (v_biz, 'New York', 'US', 'USD', 'America/New_York', 'NYC') returning id into v_br;
  insert into ids values ('nyc', v_br);

  insert into public.branches (business_id, name, country_code, currency, timezone, invoice_prefix)
  values (v_biz, 'Karachi', 'PK', 'PKR', 'Asia/Karachi', 'KHI') returning id into v_br;
  insert into ids values ('khi', v_br);

  -- A 60-minute service, no buffer, offered at all three branches.
  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (v_biz, 'Cut', 60, 0) returning id into v_svc;
  insert into ids values ('svc', v_svc);

  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  select v_svc, b.id, v_biz, 5000, true from public.branches b where b.business_id = v_biz;

  -- One staff member, at all three branches, performing the service.
  insert into public.staff_profiles (business_id, display_name, sort_order)
  values (v_biz, 'Ann', 1) returning id into v_staff;
  insert into ids values ('ann', v_staff);
  insert into public.staff_branches (staff_id, branch_id, business_id)
  select v_staff, b.id, v_biz from public.branches b where b.business_id = v_biz;
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_staff, v_biz);

  -- Every branch open every day 09:00-17:00; Ann works the same.
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select b.id, v_biz, d, 540, 1020 from public.branches b, generate_series(0,6) d
  where b.business_id = v_biz;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_staff, b.id, v_biz, d, 540, 1020 from public.branches b, generate_series(0,6) d
  where b.business_id = v_biz;

  -- A wide booking window and no notice, so the date maths is what is tested.
  update public.booking_settings
  set booking_window_days = 730, minimum_notice_minutes = 0, slot_interval = 'min_60'
  where business_id = v_biz;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Baseline: 09:00-17:00, 60-minute slots, 60-minute interval => 8 slots
-- ---------------------------------------------------------------------------
select pg_temp.chk('baseline 8 slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-15', '2027-06-15')),
  8);

select pg_temp.chk('baseline first slot is 09:00 local',
  (select local_minute from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-15', '2027-06-15') order by starts_at limit 1),
  540);

select pg_temp.chk('baseline last slot is 16:00 local',
  (select local_minute from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-15', '2027-06-15') order by starts_at desc limit 1),
  960);

-- London in June is BST (UTC+1): 09:00 local = 08:00Z.
select pg_temp.chk('London BST 09:00 local = 08:00Z',
  (select starts_at from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-15', '2027-06-15') order by starts_at limit 1),
  '2027-06-15 08:00:00+00'::timestamptz);

-- London in January is GMT: 09:00 local = 09:00Z.
select pg_temp.chk('London GMT 09:00 local = 09:00Z',
  (select starts_at from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-01-15', '2027-01-15') order by starts_at limit 1),
  '2027-01-15 09:00:00+00'::timestamptz);

-- Karachi has no DST at all (UTC+5 year-round): same offset in both seasons.
select pg_temp.chk('Karachi no DST, June 09:00 = 04:00Z',
  (select starts_at from public.get_free_slots(pg_temp.id('khi'), pg_temp.id('svc'), null, '2027-06-15', '2027-06-15') order by starts_at limit 1),
  '2027-06-15 04:00:00+00'::timestamptz);
select pg_temp.chk('Karachi no DST, January 09:00 = 04:00Z',
  (select starts_at from public.get_free_slots(pg_temp.id('khi'), pg_temp.id('svc'), null, '2027-01-15', '2027-01-15') order by starts_at limit 1),
  '2027-01-15 04:00:00+00'::timestamptz);

-- ---------------------------------------------------------------------------
-- 2. DST spring forward
--    Europe/London 2027-03-28: 01:00 -> 02:00. A 09:00-17:00 day is unaffected
--    in local terms (still 8 slots) but the UTC offset changes mid-day-boundary.
--    America/New_York 2027-03-14: 02:00 -> 03:00.
-- ---------------------------------------------------------------------------
select pg_temp.chk('London spring-forward day still has 8 local slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-03-28', '2027-03-28')),
  8);
-- On 28 March London is already BST by 09:00, so 09:00 local = 08:00Z.
select pg_temp.chk('London spring-forward 09:00 local = 08:00Z (BST)',
  (select starts_at from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-03-28', '2027-03-28') order by starts_at limit 1),
  '2027-03-28 08:00:00+00'::timestamptz);
-- The day BEFORE is still GMT: 09:00 local = 09:00Z. Proves the offset is
-- resolved per date, not once for the range.
select pg_temp.chk('London day before spring-forward 09:00 local = 09:00Z (GMT)',
  (select starts_at from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-03-27', '2027-03-27') order by starts_at limit 1),
  '2027-03-27 09:00:00+00'::timestamptz);
-- Both days in one call: 16 slots, and the two 09:00s are 23 hours apart, not
-- 24, because the spring-forward day is an hour shorter.
select pg_temp.chk('London 27->28 March: two 09:00 slots are 23h apart',
  (select extract(epoch from (max(starts_at) - min(starts_at)))::int / 3600
   from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-03-27', '2027-03-28')
   where local_minute = 540),
  23);

select pg_temp.chk('New York spring-forward day has 8 local slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('nyc'), pg_temp.id('svc'), null, '2027-03-14', '2027-03-14')),
  8);
select pg_temp.chk('New York spring-forward 09:00 EDT = 13:00Z',
  (select starts_at from public.get_free_slots(pg_temp.id('nyc'), pg_temp.id('svc'), null, '2027-03-14', '2027-03-14') order by starts_at limit 1),
  '2027-03-14 13:00:00+00'::timestamptz);
select pg_temp.chk('New York day before: 09:00 EST = 14:00Z',
  (select starts_at from public.get_free_slots(pg_temp.id('nyc'), pg_temp.id('svc'), null, '2027-03-13', '2027-03-13') order by starts_at limit 1),
  '2027-03-13 14:00:00+00'::timestamptz);

-- ---------------------------------------------------------------------------
-- 3. DST fall back
--    Europe/London 2027-10-31: 02:00 -> 01:00. America/New_York 2027-11-07.
--    No slot may be DUPLICATED: 8 distinct local minutes and 8 distinct instants.
-- ---------------------------------------------------------------------------
select pg_temp.chk('London fall-back day has 8 slots, none duplicated',
  (select count(distinct starts_at)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-10-31', '2027-10-31')),
  8);
select pg_temp.chk('London fall-back 09:00 local = 09:00Z (GMT, already switched)',
  (select starts_at from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-10-31', '2027-10-31') order by starts_at limit 1),
  '2027-10-31 09:00:00+00'::timestamptz);
select pg_temp.chk('London day before fall-back 09:00 local = 08:00Z (BST)',
  (select starts_at from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-10-30', '2027-10-30') order by starts_at limit 1),
  '2027-10-30 08:00:00+00'::timestamptz);
-- 25-hour day: the two 09:00s are 25 hours apart.
select pg_temp.chk('London 30->31 Oct: two 09:00 slots are 25h apart',
  (select extract(epoch from (max(starts_at) - min(starts_at)))::int / 3600
   from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-10-30', '2027-10-31')
   where local_minute = 540),
  25);
select pg_temp.chk('New York fall-back day has 8 slots, none duplicated',
  (select count(distinct starts_at)::int from public.get_free_slots(pg_temp.id('nyc'), pg_temp.id('svc'), null, '2027-11-07', '2027-11-07')),
  8);

-- A branch open ACROSS the repeated hour (00:00-06:00) is where fall-back
-- really bites: the local grid yields 6 slots, and the repeated 01:00 appears
-- ONCE (the first, daylight occurrence).
do $$
begin
  update public.branch_hours set start_minute = 0, end_minute = 360
  where branch_id = pg_temp.id('ldn') and day_of_week = 0;  -- 2027-10-31 is a Sunday
  update public.staff_working_hours set start_minute = 0, end_minute = 360
  where branch_id = pg_temp.id('ldn') and day_of_week = 0;
end $$;
select pg_temp.chk('overnight branch on fall-back day: 6 distinct local slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-10-31', '2027-10-31')),
  6);
select pg_temp.chk('overnight branch on fall-back day: 6 DISTINCT instants (no duplicate hour)',
  (select count(distinct starts_at)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-10-31', '2027-10-31')),
  6);
-- Postgres resolves an ambiguous local time to the SECOND (standard-time)
-- occurrence, so 01:00 local = 01:00Z (GMT), not 00:00Z (BST). What matters is
-- that it appears exactly ONCE, which the distinct-count assertion above proves.
select pg_temp.chk('fall-back 01:00 local resolves to the SECOND (GMT) occurrence 01:00Z',
  (select starts_at from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-10-31', '2027-10-31') where local_minute = 60),
  '2027-10-31 01:00:00+00'::timestamptz);
-- Restore Sunday hours.
do $$
begin
  update public.branch_hours set start_minute = 540, end_minute = 1020
  where branch_id = pg_temp.id('ldn') and day_of_week = 0;
  update public.staff_working_hours set start_minute = 540, end_minute = 1020
  where branch_id = pg_temp.id('ldn') and day_of_week = 0;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Breaks
-- ---------------------------------------------------------------------------
do $$
begin
  -- Lunch 12:00-13:00 on the Tuesday (2027-06-15 is a Tuesday => dow 2).
  insert into public.staff_breaks (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute, label)
  values (pg_temp.id('ann'), pg_temp.id('ldn'), pg_temp.id('biz'), 2, 720, 780, 'Lunch');
end $$;
select pg_temp.chk('a 1h break removes exactly one 1h slot',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-15', '2027-06-15')),
  7);
select pg_temp.chk('the 12:00 slot is the one removed',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-15', '2027-06-15') where local_minute = 720),
  0);
select pg_temp.chk('13:00 is still bookable (break range is half-open)',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-15', '2027-06-15') where local_minute = 780),
  1);

-- ---------------------------------------------------------------------------
-- 5. Holiday / closure
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.branch_closures (branch_id, business_id, starts_on, ends_on, name)
  values (pg_temp.id('ldn'), pg_temp.id('biz'), '2027-06-16', '2027-06-17', 'Staff training');
end $$;
select pg_temp.chk('a closure removes its days (inclusive both ends)',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-16', '2027-06-17')),
  0);
select pg_temp.chk('the day after the closure is open again',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-18', '2027-06-18')),
  8);

-- ---------------------------------------------------------------------------
-- 6. Time off
-- ---------------------------------------------------------------------------
do $$
begin
  -- 2027-06-18 10:00-12:00 London (BST) = 09:00-11:00Z.
  insert into public.staff_time_off (staff_id, business_id, branch_id, starts_at, ends_at, is_all_day)
  values (pg_temp.id('ann'), pg_temp.id('biz'), pg_temp.id('ldn'),
          '2027-06-18 09:00:00+00', '2027-06-18 11:00:00+00', false);
end $$;
select pg_temp.chk('2h of time off removes 2 slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-18', '2027-06-18')),
  6);
select pg_temp.chk('the 10:00 and 11:00 slots are the ones removed',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-18', '2027-06-18')
   where local_minute in (600, 660)),
  0);

-- ---------------------------------------------------------------------------
-- 7. An existing appointment blocks its slot; cancelling frees it
-- ---------------------------------------------------------------------------
do $$
declare v_client uuid; v_fv uuid; v_appt uuid;
begin
  insert into public.clients (business_id, full_name, phone_e164)
  values (pg_temp.id('biz'), 'Test Client', '+447700900001') returning id into v_client;
  insert into ids values ('client', v_client);
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biz') order by version desc limit 1;
  insert into ids values ('fv', v_fv);

  -- 2027-06-22 (Tuesday) 10:00 BST = 09:00Z.
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, buffer_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), v_client, pg_temp.id('svc'), pg_temp.id('ann'),
    '2027-06-22 09:00:00+00', '2027-06-22 10:00:00+00', 60, 0, 'confirmed', v_fv, true)
  returning id into v_appt;
  insert into ids values ('appt', v_appt);
end $$;

select pg_temp.chk('a booking removes its slot (break also applies: 8-1-1)',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-22', '2027-06-22')),
  6);
select pg_temp.chk('the booked 10:00 slot is gone',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-22', '2027-06-22') where local_minute = 600),
  0);

-- 'pending' must hold the slot too (manual confirmation).
do $$ begin
  update public.appointments set status = 'pending' where id = pg_temp.id('appt');
end $$;
select pg_temp.chk('pending HOLDS the slot',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-22', '2027-06-22') where local_minute = 600),
  0);

-- Cancelling frees it.
do $$ begin
  update public.appointments set status = 'cancelled', cancelled_at = now() where id = pg_temp.id('appt');
end $$;
select pg_temp.chk('cancelling frees the slot',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-22', '2027-06-22') where local_minute = 600),
  1);

-- no_show also frees it.
do $$ begin
  update public.appointments set status = 'no_show', cancelled_at = null where id = pg_temp.id('appt');
end $$;
select pg_temp.chk('no_show frees the slot',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-22', '2027-06-22') where local_minute = 600),
  1);

-- ---------------------------------------------------------------------------
-- 8. The DB refuses a concurrent double booking (exclusion constraint)
-- ---------------------------------------------------------------------------
do $$
declare v_err text := 'no error';
begin
  update public.appointments set status = 'confirmed', cancelled_at = null where id = pg_temp.id('appt');
  begin
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
      starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
    values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
      '2027-06-22 09:30:00+00', '2027-06-22 10:30:00+00', 60, 'confirmed', pg_temp.id('fv'), true);
    v_err := 'INSERT SUCCEEDED';
  exception when exclusion_violation then
    v_err := 'refused';
  end;
  insert into res (name, pass, detail)
  values ('overlapping exclusive booking is refused by the DB', v_err = 'refused', v_err);
end $$;

-- A group booking (is_exclusive = false) is NOT blocked by the constraint.
do $$
declare v_err text := 'ok';
begin
  begin
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
      starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
    values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
      '2027-06-23 09:00:00+00', '2027-06-23 10:00:00+00', 60, 'confirmed', pg_temp.id('fv'), false);
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
      starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
    values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
      '2027-06-23 09:00:00+00', '2027-06-23 10:00:00+00', 60, 'confirmed', pg_temp.id('fv'), false);
  exception when others then
    v_err := SQLERRM;
  end;
  insert into res (name, pass, detail)
  values ('two group bookings in one slot are allowed by the constraint', v_err = 'ok', v_err);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Buffer
-- ---------------------------------------------------------------------------
do $$ begin
  -- Clear the Tuesday appointments so the buffer test starts clean.
  delete from public.appointments where business_id = pg_temp.id('biz');
  -- 15-minute buffer on the service.
  update public.services set buffer_minutes = 15 where id = pg_temp.id('svc');
end $$;
-- 09:00-17:00, 60-min service + 15-min buffer, 60-min interval. The last
-- candidate that leaves room for the SERVICE is 16:00; the buffer may spill
-- past closing, so still 8 slots (minus the Tuesday break = 7).
select pg_temp.chk('buffer does not reduce the slot count at end of day',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')),
  7);
-- Now book 10:00 and check the buffer blocks the 11:00 slot too... it does not,
-- because 10:00+60+15 = 11:15 overlaps 11:00. So 11:00 IS blocked.
do $$ begin
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, buffer_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
    '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00', 60, 15, 'confirmed', pg_temp.id('fv'), true);
end $$;
select pg_temp.chk('a booking at 10:00 with a 15-min buffer also blocks 11:00',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where local_minute in (600, 660)),
  0);
-- 12:00 is blocked by the Tuesday lunch break from section 4, NOT by the
-- buffer (10:00 + 60 + 15 = 11:15 does not reach 12:00). 13:00 is the proof
-- that the buffer stopped at 11:15.
select pg_temp.chk('13:00 is free: the buffer only reached 11:15',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where local_minute = 780),
  1);
do $$ begin
  delete from public.appointments where business_id = pg_temp.id('biz');
  update public.services set buffer_minutes = 0 where id = pg_temp.id('svc');
end $$;

-- ---------------------------------------------------------------------------
-- 10. Slot interval
-- ---------------------------------------------------------------------------
do $$ begin
  update public.booking_settings set slot_interval = 'min_15' where branch_id = pg_temp.id('ldn');
end $$;
-- 09:00..16:00 in 15-minute steps, inclusive = 29 candidates. Minus the Tuesday
-- break 12:00-13:00, which a 60-minute service overlaps from 11:15 to 12:45
-- (11:15,11:30,11:45,12:00,12:15,12:30,12:45 = 7 removed) => 22.
select pg_temp.chk('15-min interval: 29 candidates before the break',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')),
  22);
do $$ begin
  update public.booking_settings set slot_interval = 'service_length' where branch_id = pg_temp.id('ldn');
end $$;
select pg_temp.chk('service_length interval steps by 60 => 7 (8 minus the break)',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')),
  7);
do $$ begin
  update public.booking_settings set slot_interval = 'min_60' where branch_id = pg_temp.id('ldn');
end $$;

-- ---------------------------------------------------------------------------
-- 11. Booking window
-- ---------------------------------------------------------------------------
do $$ begin
  update public.booking_settings set booking_window_days = 7 where branch_id = pg_temp.id('ldn');
end $$;
select pg_temp.chk('a 7-day window refuses day 30',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'),
     null, (now() at time zone 'Europe/London')::date + 30, (now() at time zone 'Europe/London')::date + 30)),
  0);
select pg_temp.chk('a 7-day window allows day 5',
  (select count(*)::int > 0 from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'),
     null, (now() at time zone 'Europe/London')::date + 5, (now() at time zone 'Europe/London')::date + 5)),
  true);
select pg_temp.chk('a past date is never offered',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'),
     null, '2020-01-01', '2020-01-02')),
  0);
do $$ begin
  update public.booking_settings set booking_window_days = 730 where branch_id = pg_temp.id('ldn');
end $$;

-- ---------------------------------------------------------------------------
-- 12. Minimum notice
-- ---------------------------------------------------------------------------
-- 48 hours of notice: nothing within the next two days.
do $$ begin
  update public.booking_settings set minimum_notice_minutes = 2880 where branch_id = pg_temp.id('ldn');
end $$;
select pg_temp.chk('48h notice: tomorrow has no slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'),
     null, (now() at time zone 'Europe/London')::date + 1, (now() at time zone 'Europe/London')::date + 1)),
  0);
select pg_temp.chk('48h notice: day 4 still has slots',
  (select count(*)::int > 0 from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'),
     null, (now() at time zone 'Europe/London')::date + 4, (now() at time zone 'Europe/London')::date + 4)),
  true);
select pg_temp.chk('p_ignore_notice lets the dashboard past the notice rule',
  (select count(*)::int > 0 from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'),
     null, (now() at time zone 'Europe/London')::date + 1, (now() at time zone 'Europe/London')::date + 1, true)),
  true);
do $$ begin
  update public.booking_settings set minimum_notice_minutes = 0 where branch_id = pg_temp.id('ldn');
end $$;

-- ---------------------------------------------------------------------------
-- 13. online_booking_enabled
-- ---------------------------------------------------------------------------
do $$ begin
  update public.booking_settings set online_booking_enabled = false where branch_id = pg_temp.id('ldn');
end $$;
select pg_temp.chk('a non-bookable branch returns no slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')),
  0);
do $$ begin
  update public.booking_settings set online_booking_enabled = true where branch_id = pg_temp.id('ldn');
end $$;

-- ---------------------------------------------------------------------------
-- 14. Resources
-- ---------------------------------------------------------------------------
do $$
declare v_room uuid;
begin
  insert into public.resources (business_id, branch_id, name, capacity)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), 'Room 1', 1) returning id into v_room;
  insert into ids values ('room', v_room);
  insert into public.service_resources (service_id, resource_id, business_id)
  values (pg_temp.id('svc'), v_room, pg_temp.id('biz'));
  update public.booking_settings set use_resources = true where branch_id = pg_temp.id('ldn');
end $$;
select pg_temp.chk('with resources on, slots carry the resource id',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where resource_id is not null),
  7);
-- Occupy the room at 10:00 with a DIFFERENT staff member, so only the resource
-- is the constraint.
do $$
declare v_bob uuid;
begin
  insert into public.staff_profiles (business_id, display_name, sort_order)
  values (pg_temp.id('biz'), 'Bob', 2) returning id into v_bob;
  insert into ids values ('bob', v_bob);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_bob, pg_temp.id('ldn'), pg_temp.id('biz'));
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, resource_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), v_bob, pg_temp.id('room'),
    '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00', 60, 'confirmed', pg_temp.id('fv'), true);
end $$;
select pg_temp.chk('a capacity-1 room in use removes that slot even though the staff is free',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where local_minute = 600),
  0);
-- Raise capacity to 2: the slot comes back.
do $$ begin
  update public.resources set capacity = 2 where id = pg_temp.id('room');
end $$;
select pg_temp.chk('capacity 2 makes the slot available again',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where local_minute = 600),
  1);
do $$ begin
  delete from public.appointments where business_id = pg_temp.id('biz');
  update public.booking_settings set use_resources = false where branch_id = pg_temp.id('ldn');
end $$;

-- ---------------------------------------------------------------------------
-- 15. People per slot
-- ---------------------------------------------------------------------------
do $$ begin
  update public.booking_settings set people_per_slot = 3 where branch_id = pg_temp.id('ldn');
end $$;
select pg_temp.chk('people_per_slot 3 reports 3 seats left when empty',
  (select seats_left from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where local_minute = 600 and staff_id = pg_temp.id('ann')),
  3);
do $$ begin
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
    '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00', 60, 'confirmed', pg_temp.id('fv'), false);
end $$;
select pg_temp.chk('one group booking leaves 2 seats',
  (select seats_left from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where local_minute = 600 and staff_id = pg_temp.id('ann')),
  2);
do $$ begin
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  select pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
    '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00', 60, 'confirmed', pg_temp.id('fv'), false
  from generate_series(1,2);
end $$;
select pg_temp.chk('a full group slot is no longer offered',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where local_minute = 600 and staff_id = pg_temp.id('ann')),
  0);
do $$ begin
  delete from public.appointments where business_id = pg_temp.id('biz');
  update public.booking_settings set people_per_slot = 1 where branch_id = pg_temp.id('ldn');
end $$;

-- ---------------------------------------------------------------------------
-- 16. A branch with no hours set has no slots
-- ---------------------------------------------------------------------------
select pg_temp.chk('a branch whose hours were never set has no slots (nyc hours exist, khi too; use a fresh branch)',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29') ) > 0,
  true);
do $$
declare v_new uuid;
begin
  insert into public.branches (business_id, name, country_code, currency, timezone, invoice_prefix)
  values (pg_temp.id('biz'), 'Fresh', 'GB', 'GBP', 'Europe/London', 'FRS') returning id into v_new;
  insert into ids values ('fresh', v_new);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (pg_temp.id('svc'), v_new, pg_temp.id('biz'), 5000, true);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (pg_temp.id('ann'), v_new, pg_temp.id('biz'));
end $$;
select pg_temp.chk('a branch with NO branch_hours yields no slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('fresh'), pg_temp.id('svc'), null, '2027-06-29', '2027-07-06')),
  0);
select pg_temp.chk('a new branch got a booking_settings row from the trigger',
  (select count(*)::int from public.booking_settings where branch_id = pg_temp.id('fresh')),
  1);

-- ---------------------------------------------------------------------------
-- 17. Staff eligibility
-- ---------------------------------------------------------------------------
-- Bob is at the London branch but does NOT perform the service.
select pg_temp.chk('a staff member who does not perform the service is not offered',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where staff_id = pg_temp.id('bob')),
  0);
-- Ann off-line for online booking.
do $$ begin
  update public.staff_profiles set is_bookable_online = false where id = pg_temp.id('ann');
end $$;
select pg_temp.chk('is_bookable_online = false removes the staff member',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')),
  0);
do $$ begin
  update public.staff_profiles set is_bookable_online = true, is_active = false where id = pg_temp.id('ann');
end $$;
select pg_temp.chk('is_active = false removes the staff member',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')),
  0);
do $$ begin
  update public.staff_profiles set is_active = true where id = pg_temp.id('ann');
end $$;
-- The service disabled at this branch.
do $$ begin
  update public.service_branches set enabled = false
  where service_id = pg_temp.id('svc') and branch_id = pg_temp.id('ldn');
end $$;
select pg_temp.chk('a service disabled at the branch yields no slots',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')),
  0);
do $$ begin
  update public.service_branches set enabled = true
  where service_id = pg_temp.id('svc') and branch_id = pg_temp.id('ldn');
end $$;

-- ---------------------------------------------------------------------------
-- 18. "Any staff": least-loaded, then sort_order, then id
-- ---------------------------------------------------------------------------
do $$ begin
  -- Bob now performs the service and works the same hours.
  insert into public.service_staff (service_id, staff_id, business_id)
  values (pg_temp.id('svc'), pg_temp.id('bob'), pg_temp.id('biz'));
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select pg_temp.id('bob'), pg_temp.id('ldn'), pg_temp.id('biz'), d, 540, 1020 from generate_series(0,6) d;
end $$;
select pg_temp.chk('"Any staff" returns one row per staff per slot',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')
   where local_minute = 600),
  2);
-- Both at zero appointments: sort_order decides (Ann = 1, Bob = 2).
select pg_temp.chk('tie on load => lowest sort_order wins (Ann)',
  (select public.pick_staff_for_slot(pg_temp.id('ldn'), pg_temp.id('svc'),
     '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00')),
  pg_temp.id('ann'));
-- Give Ann an appointment that day (elsewhere in the day): Bob becomes least-loaded.
do $$ begin
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
    '2027-06-29 13:00:00+00', '2027-06-29 14:00:00+00', 60, 'confirmed', pg_temp.id('fv'), true);
end $$;
select pg_temp.chk('least-loaded wins: Ann has 1 that day, so Bob is picked',
  (select public.pick_staff_for_slot(pg_temp.id('ldn'), pg_temp.id('svc'),
     '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00')),
  pg_temp.id('bob'));
-- A staff member who is busy in THAT window is never picked.
do $$ begin
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('bob'),
    '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00', 60, 'confirmed', pg_temp.id('fv'), true);
end $$;
select pg_temp.chk('a busy staff member is not picked even when least-loaded overall',
  (select public.pick_staff_for_slot(pg_temp.id('ldn'), pg_temp.id('svc'),
     '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00')),
  pg_temp.id('ann'));
-- Everyone busy => null.
do $$ begin
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
    '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00', 60, 'confirmed', pg_temp.id('fv'), true);
end $$;
select pg_temp.chk('nobody free => pick_staff_for_slot returns null',
  (select public.pick_staff_for_slot(pg_temp.id('ldn'), pg_temp.id('svc'),
     '2027-06-29 09:00:00+00', '2027-06-29 10:00:00+00')),
  null::uuid);

-- ---------------------------------------------------------------------------
-- 19. Cross-tenant and unknown ids leak nothing
-- ---------------------------------------------------------------------------
select pg_temp.chk('an unknown branch returns no rows',
  (select count(*)::int from public.get_free_slots(gen_random_uuid(), pg_temp.id('svc'), null, '2027-06-29', '2027-06-29')),
  0);
select pg_temp.chk('an unknown service returns no rows',
  (select count(*)::int from public.get_free_slots(pg_temp.id('ldn'), gen_random_uuid(), null, '2027-06-29', '2027-06-29')),
  0);

-- ---------------------------------------------------------------------------
-- 20. Form versioning
-- ---------------------------------------------------------------------------
do $$
declare v_before int; v_after int; v_f uuid;
begin
  select count(*) into v_before from public.form_versions where business_id = pg_temp.id('biz');
  insert into public.custom_fields (business_id, label, field_type, is_required)
  values (pg_temp.id('biz'), 'Any allergies?', 'long_text', false) returning id into v_f;
  insert into ids values ('field', v_f);
  select count(*) into v_after from public.form_versions where business_id = pg_temp.id('biz');
  insert into res (name, pass, detail)
  values ('adding a custom field creates a new form version', v_after = v_before + 1,
          v_before || ' -> ' || v_after);
end $$;

-- The same field set twice does not create a second version.
do $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from public.form_versions where business_id = pg_temp.id('biz');
  -- A no-op update: the snapshot is identical, so the hash matches.
  update public.custom_fields set updated_at = now() where id = pg_temp.id('field');
  select count(*) into v_after from public.form_versions where business_id = pg_temp.id('biz');
  insert into res (name, pass, detail)
  values ('an unchanged field set does not create a version', v_after = v_before,
          v_before || ' -> ' || v_after);
end $$;

-- The snapshot contains what the validator needs.
select pg_temp.chk('the latest snapshot carries the field label',
  (select fields->0->>'label' from public.form_versions
   where business_id = pg_temp.id('biz') order by version desc limit 1),
  'Any allergies?');
select pg_temp.chk('the latest snapshot carries the type',
  (select fields->0->>'field_type' from public.form_versions
   where business_id = pg_temp.id('biz') order by version desc limit 1),
  'long_text');

-- A form version is immutable.
do $$
declare v_err text := 'no error';
begin
  begin
    update public.form_versions set version = 99
    where business_id = pg_temp.id('biz') and version = 1;
    v_err := 'UPDATE SUCCEEDED';
  exception when others then v_err := 'refused'; end;
  insert into res (name, pass, detail) values ('form_versions cannot be updated', v_err = 'refused', v_err);
end $$;
do $$
declare v_err text := 'no error';
begin
  begin
    delete from public.form_versions where business_id = pg_temp.id('biz') and version = 1;
    v_err := 'DELETE SUCCEEDED';
  exception when others then v_err := 'refused'; end;
  insert into res (name, pass, detail) values ('form_versions cannot be deleted', v_err = 'refused', v_err);
end $$;

-- A dropdown needs 2+ options; other types may have none.
do $$
declare v_err text := 'no error';
begin
  begin
    insert into public.custom_fields (business_id, label, field_type, options)
    values (pg_temp.id('biz'), 'Pick one', 'dropdown', array['only one']);
    v_err := 'INSERT SUCCEEDED';
  exception when check_violation then v_err := 'refused'; end;
  insert into res (name, pass, detail) values ('a dropdown with 1 option is refused', v_err = 'refused', v_err);
end $$;
do $$
declare v_err text := 'no error';
begin
  begin
    insert into public.custom_fields (business_id, label, field_type, options)
    values (pg_temp.id('biz'), 'A number', 'number', array['a','b']);
    v_err := 'INSERT SUCCEEDED';
  exception when check_violation then v_err := 'refused'; end;
  insert into res (name, pass, detail) values ('options on a non-dropdown are refused', v_err = 'refused', v_err);
end $$;

-- ---------------------------------------------------------------------------
-- 21. Sensitivity escalates and cannot be cleared
-- ---------------------------------------------------------------------------
do $$
declare v_appt uuid; v_err text := 'no error'; v_sens boolean;
begin
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('ldn'), pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
    '2027-07-06 09:00:00+00', '2027-07-06 10:00:00+00', 60, 'confirmed',
    (select id from public.form_versions where business_id = pg_temp.id('biz') order by version desc limit 1), true)
  returning id into v_appt;

  -- An answer captured while the field was NOT sensitive.
  insert into public.appointment_field_values (business_id, appointment_id, custom_field_id, form_version_id, value, is_sensitive)
  values (pg_temp.id('biz'), v_appt, pg_temp.id('field'),
    (select id from public.form_versions where business_id = pg_temp.id('biz') order by version desc limit 1),
    'penicillin', false);

  -- Mark the field sensitive: the OLD answer must escalate too.
  update public.custom_fields set is_sensitive = true where id = pg_temp.id('field');
  select is_sensitive into v_sens from public.appointment_field_values
  where appointment_id = v_appt and custom_field_id = pg_temp.id('field');
  insert into res (name, pass, detail)
  values ('marking a field sensitive escalates EXISTING answers', v_sens is true, 'is_sensitive=' || v_sens);

  -- And it cannot be cleared again.
  begin
    update public.custom_fields set is_sensitive = false where id = pg_temp.id('field');
    v_err := 'UPDATE SUCCEEDED';
  exception when others then v_err := 'refused'; end;
  insert into res (name, pass, detail) values ('is_sensitive cannot be cleared', v_err = 'refused', v_err);

  -- The type is frozen once answers exist.
  v_err := 'no error';
  begin
    update public.custom_fields set field_type = 'short_text' where id = pg_temp.id('field');
    v_err := 'UPDATE SUCCEEDED';
  exception when others then v_err := 'refused'; end;
  insert into res (name, pass, detail) values ('the field type is frozen once answers exist', v_err = 'refused', v_err);
end $$;

-- ---------------------------------------------------------------------------
-- 22. Client identity
-- ---------------------------------------------------------------------------
do $$
declare v_err text := 'no error';
begin
  begin
    insert into public.clients (business_id, full_name, phone_e164)
    values (pg_temp.id('biz'), 'Someone Else', '+447700900001');
    v_err := 'INSERT SUCCEEDED';
  exception when unique_violation then v_err := 'refused'; end;
  insert into res (name, pass, detail)
  values ('a duplicate phone in one business is refused', v_err = 'refused', v_err);
end $$;
do $$
declare v_err text := 'no error';
begin
  begin
    insert into public.clients (business_id, full_name, phone_e164)
    values (pg_temp.id('biz'), 'Bad Phone', '07700900001');
    v_err := 'INSERT SUCCEEDED';
  exception when check_violation then v_err := 'refused'; end;
  insert into res (name, pass, detail)
  values ('a non-E.164 phone is refused', v_err = 'refused', v_err);
end $$;
-- A soft-deleted client frees the number.
do $$
declare v_err text := 'ok';
begin
  update public.clients set deleted_at = now() where business_id = pg_temp.id('biz') and phone_e164 = '+447700900001';
  begin
    insert into public.clients (business_id, full_name, phone_e164)
    values (pg_temp.id('biz'), 'New Person', '+447700900001');
  exception when others then v_err := SQLERRM; end;
  insert into res (name, pass, detail)
  values ('a soft-deleted client frees the phone number', v_err = 'ok', v_err);
end $$;

-- ---------------------------------------------------------------------------
-- 23. Tenant guards
-- ---------------------------------------------------------------------------
do $$
declare v_biz2 uuid; v_br2 uuid; v_err text := 'no error';
begin
  insert into public.businesses (name, slug, status, language, trial_ends_at)
  values ('Other Co', 'other-co-check', 'trialing', 'en', now() + interval '1000 days')
  returning id into v_biz2;
  insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, invoice_prefix)
  values (v_biz2, 'Theirs', true, 'GB', 'GBP', 'Europe/London', 'OTH') returning id into v_br2;

  begin
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
      starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
    values (pg_temp.id('biz'), v_br2, pg_temp.id('client'), pg_temp.id('svc'), pg_temp.id('ann'),
      '2027-08-01 09:00:00+00', '2027-08-01 10:00:00+00', 60, 'confirmed', pg_temp.id('fv'), true);
    v_err := 'INSERT SUCCEEDED';
  exception when others then v_err := 'refused'; end;
  insert into res (name, pass, detail)
  values ('an appointment on another business''s branch is refused', v_err = 'refused', v_err);
end $$;

-- ---------------------------------------------------------------------------
-- 24. Grants: the engine is service_role only
-- ---------------------------------------------------------------------------
select pg_temp.chk('anon cannot execute get_free_slots',
  has_function_privilege('anon', 'public.get_free_slots(uuid,uuid,uuid,date,date,boolean)', 'execute'),
  false);
select pg_temp.chk('authenticated cannot execute get_free_slots',
  has_function_privilege('authenticated', 'public.get_free_slots(uuid,uuid,uuid,date,date,boolean)', 'execute'),
  false);
select pg_temp.chk('service_role CAN execute get_free_slots',
  has_function_privilege('service_role', 'public.get_free_slots(uuid,uuid,uuid,date,date,boolean)', 'execute'),
  true);
select pg_temp.chk('anon cannot execute pick_staff_for_slot',
  has_function_privilege('anon', 'public.pick_staff_for_slot(uuid,uuid,timestamptz,timestamptz)', 'execute'),
  false);
select pg_temp.chk('anon cannot execute ensure_form_version',
  has_function_privilege('anon', 'public.ensure_form_version(uuid)', 'execute'),
  false);
select pg_temp.chk('anon cannot execute normalise_phone_e164',
  has_function_privilege('anon', 'public.normalise_phone_e164(text,text)', 'execute'),
  false);

-- anon must have no table privileges on any new table.
select pg_temp.chk('anon has no privileges on appointments',
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public' and table_name = 'appointments'),
  0);
select pg_temp.chk('anon has no privileges on clients',
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public' and table_name = 'clients'),
  0);
select pg_temp.chk('anon has no policies on the new tables',
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and tablename in ('booking_settings','custom_fields','custom_field_services','form_versions',
                       'clients','appointments','appointment_field_values','booking_manage_tokens')
     and 'anon' = any(roles)),
  0);
select pg_temp.chk('RLS is on for all 8 new tables',
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity
     and c.relname in ('booking_settings','custom_fields','custom_field_services','form_versions',
                       'clients','appointments','appointment_field_values','booking_manage_tokens')),
  8);

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
select n, name, detail from res where not pass order by n;

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total,
  coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;

rollback;
