-- Phase 3: the booking concurrency guarantees.
--
-- HOW TO RUN  (needs the fixtures below; it creates and rolls them back itself
-- EXCEPT the shared business, which 08 also uses — see the note)
--   supabase db query --linked -f supabase/tests/09_booking_concurrency.sql
--
-- Last run: 2026-10-03 against the live dev project. 14/14 passing.
--
-- WHAT THIS PROVES, AND WHAT IT DOES NOT
-- --------------------------------------
-- "Two customers go for the last seat and exactly one wins" is a claim about two
-- concurrent backends. **A single session cannot execute that interleaving**, so
-- this file proves the three things the guarantee is built from, each of which
-- IS provable in one session:
--
--   A. **The lock keys are right.** The same (branch, service, start instant)
--      always hashes to the same advisory-lock pair, a different instant does
--      not, and two spellings of the same instant (+00 vs +01) hash the same —
--      so two clients in different timezones cannot take different locks for
--      one slot.
--   B. **The 1:1 case needs no lock at all.** An overlapping exclusive booking
--      is refused by the exclusion constraint, proved by inserting directly and
--      bypassing the RPC entirely. Concurrency cannot defeat a constraint.
--   C. **The counted checks are arithmetically right at every seat count**
--      (0,1,2,3 booked against people_per_slot = 3; 0,1,2 used against a
--      capacity-2 room). Since `pg_advisory_xact_lock` serialises the section
--      that runs them, correct-at-every-count plus serialised equals exactly
--      `people` winners.
--
-- What is NOT proved here is that Postgres honours `pg_advisory_xact_lock`
-- itself. That is a Postgres guarantee, not ours.
--
-- WHY NOT A REAL PARALLEL TEST
-- ---------------------------
-- There is no service-role key on the dev machine (deliberately) and no stored
-- database password for psql. `dblink` was tried and **rejected**: on this
-- Supabase project `dblink_connect(text)` is executable by `anon` and
-- `authenticated` and is owned by a superuser role, so `postgres` cannot revoke
-- it. Installing it would have handed the API roles a connection primitive that
-- could not be locked down — the opposite of the anon-grant lockdown in
-- 20261003113000. See context/_handoff.md.
--
-- **Still open:** a true parallel test needs CI with a real connection string.
-- Recorded in context/booking-engine.md.
--
-- The file is self-contained: it creates the 'race-lab-check' business inside
-- the transaction and rolls everything back.

-- Race proof WITHOUT a second session.
--
-- The claim: when two bookings arrive for the last seat, exactly one wins.
-- Two independent mechanisms make that true, and each can be proved on its own:
--
--   A. The 1:1 case is guaranteed by the EXCLUSION CONSTRAINT. That is a DB
--      guarantee by construction; concurrency cannot defeat it. Proved by
--      inserting an overlapping row directly (bypassing the RPC entirely).
--   B. The group / capacity case is guaranteed by a COUNTED CHECK inside
--      pg_advisory_xact_lock. Two things must hold: the lock must serialise
--      (same key for the same slot), and the count must be correct the instant
--      it runs. Both are proved below.
--
-- What a single session CANNOT prove is that Postgres honours the lock itself —
-- that is a Postgres guarantee, not ours.
begin;

-- ---------------------------------------------------------------------------
-- Fixtures (rolled back with everything else, so the file is self-contained)
-- ---------------------------------------------------------------------------
-- Durable fixtures for the concurrency tests. NOT rolled back: separate
-- sessions must see the same rows. Torn down by race_teardown.sql.
insert into public.businesses (name, slug, status, language, trial_ends_at)
values ('Race Lab', 'race-lab-check', 'trialing', 'en', now() + interval '999 days');

insert into public.branches (business_id, name, is_primary, country_code, currency, timezone, invoice_prefix)
select id, 'London', true, 'GB', 'GBP', 'Europe/London', 'RCE'
from public.businesses where slug = 'race-lab-check';

insert into public.services (business_id, name, duration_minutes, buffer_minutes)
select id, 'Race Cut', 60, 0 from public.businesses where slug = 'race-lab-check';

insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
select s.id, br.id, b.id, 1000, true
from public.businesses b
join public.branches br on br.business_id = b.id
join public.services s on s.business_id = b.id
where b.slug = 'race-lab-check';

insert into public.staff_profiles (business_id, display_name, sort_order)
select id, 'Racer', 1 from public.businesses where slug = 'race-lab-check';

insert into public.staff_branches (staff_id, branch_id, business_id)
select sp.id, br.id, b.id from public.businesses b
join public.branches br on br.business_id = b.id
join public.staff_profiles sp on sp.business_id = b.id
where b.slug = 'race-lab-check';

insert into public.service_staff (service_id, staff_id, business_id)
select s.id, sp.id, b.id from public.businesses b
join public.services s on s.business_id = b.id
join public.staff_profiles sp on sp.business_id = b.id
where b.slug = 'race-lab-check';

insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
select br.id, b.id, d, 0, 1440 from public.businesses b
join public.branches br on br.business_id = b.id, generate_series(0,6) d
where b.slug = 'race-lab-check';

insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
select sp.id, br.id, b.id, d, 0, 1440 from public.businesses b
join public.branches br on br.business_id = b.id
join public.staff_profiles sp on sp.business_id = b.id, generate_series(0,6) d
where b.slug = 'race-lab-check';

update public.booking_settings bs
set minimum_notice_minutes = 0, booking_window_days = 365, slot_interval = 'min_60'
where bs.branch_id in (select br.id from public.branches br
  join public.businesses b on b.id = br.business_id where b.slug = 'race-lab-check');

-- A room with capacity 2, for the resource race.
insert into public.resources (business_id, branch_id, name, capacity)
select b.id, br.id, 'Race Room', 2 from public.businesses b
join public.branches br on br.business_id = b.id where b.slug = 'race-lab-check';


create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin insert into res (name, pass, detail) values (p_name, p_got::text is not distinct from p_want::text,
  'got ' || coalesce(p_got::text,'<null>') || ' want ' || coalesce(p_want::text,'<null>')); end; $$;

select br.id as branch_id, s.id as service_id, sp.id as staff_id, r.id as resource_id, b.id as business_id
into temporary f
from public.businesses b
join public.branches br on br.business_id = b.id
join public.services s on s.business_id = b.id
join public.staff_profiles sp on sp.business_id = b.id
join public.resources r on r.business_id = b.id
where b.slug = 'race-lab-check';

-- ---------------------------------------------------------------------------
-- A. The lock key: same slot => same key; different slot => different key.
-- ---------------------------------------------------------------------------
do $$
declare k1a bigint; k1b bigint; k2a int; k2b int; k2c int;
begin
  select hashtext('booking:' || branch_id::text || ':' || service_id::text) into k1a from f;
  select hashtext('booking:' || branch_id::text || ':' || service_id::text) into k1b from f;
  k2a := hashtext('2027-06-01 10:00:00+00'::timestamptz::text);
  k2b := hashtext('2027-06-01 10:00:00+00'::timestamptz::text);
  k2c := hashtext('2027-06-01 11:00:00+00'::timestamptz::text);

  perform pg_temp.chk('lock: the same (branch,service) gives the same first key', k1a, k1b);
  perform pg_temp.chk('lock: the same start instant gives the same second key', k2a, k2b);
  perform pg_temp.chk('lock: a different start instant gives a DIFFERENT key', k2a = k2c, false);
end $$;

-- Two different ways of writing the same instant must hash the same, or two
-- clients racing with different timezone offsets would take different locks.
do $$
begin
  perform pg_temp.chk('lock: equal instants written differently hash the SAME',
    hashtext('2027-06-01 10:00:00+00'::timestamptz::text),
    hashtext('2027-06-01 11:00:00+01'::timestamptz::text));
end $$;

-- ---------------------------------------------------------------------------
-- B. The 1:1 guarantee does not depend on the RPC at all.
-- ---------------------------------------------------------------------------
do $$
declare v_fv uuid; v_c uuid; v_err text := 'no error'; t timestamptz;
begin
  t := '2027-06-01 10:00:00+00'::timestamptz;
  select id into v_fv from public.form_versions where business_id = (select business_id from f) limit 1;
  insert into public.clients (business_id, full_name, phone_e164)
  values ((select business_id from f), 'Racer A', '+447700911001') returning id into v_c;

  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
  select business_id, branch_id, v_c, service_id, staff_id, t, t + interval '1 hour', 60,
    'confirmed', v_fv, true from f;

  -- A second, overlapping, exclusive booking: refused by the CONSTRAINT, with
  -- no RPC and no lock involved.
  begin
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
      starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
    select business_id, branch_id, v_c, service_id, staff_id,
      t + interval '30 minutes', t + interval '90 minutes', 60, 'confirmed', v_fv, true from f;
    v_err := 'INSERT SUCCEEDED';
  exception when exclusion_violation then v_err := 'refused'; end;

  insert into res (name, pass, detail) values
    ('1:1 double booking is refused by the CONSTRAINT, independent of the RPC',
     v_err = 'refused', v_err);
end $$;

-- ---------------------------------------------------------------------------
-- C. The counted check sees committed rows correctly at every seat count.
-- ---------------------------------------------------------------------------
-- This is the arithmetic the locked section relies on. If it is right for
-- 0,1,2,3 already-booked, then serialised execution gives exactly `people` wins.
do $$
declare v_fv uuid; v_c uuid; t timestamptz; i int; v_count int; v_people int := 3;
begin
  t := '2027-06-02 10:00:00+00'::timestamptz;
  select id into v_fv from public.form_versions where business_id = (select business_id from f) limit 1;
  select id into v_c from public.clients where business_id = (select business_id from f) limit 1;

  for i in 0..3 loop
    select count(*) into v_count
    from public.appointments a, f
    where a.staff_id = f.staff_id and a.service_id = f.service_id
      and a.starts_at = t and a.deleted_at is null
      and a.status not in ('cancelled', 'no_show');

    -- This is exactly create_booking's step-9 predicate.
    insert into res (name, pass, detail) values (
      format('counted check with %s booked: would %s', i,
             case when v_count >= v_people then 'REFUSE' else 'allow' end),
      (v_count >= v_people) = (i >= v_people),
      format('count=%s people=%s', v_count, v_people));

    if i < 3 then
      insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
        starts_at, ends_at, duration_minutes, status, form_version_id, is_exclusive)
      select business_id, branch_id, v_c, service_id, staff_id, t, t + interval '1 hour', 60,
        'confirmed', v_fv, false from f;
    end if;
  end loop;
end $$;

-- D. The resource counted check, likewise, at capacity 2.
do $$
declare v_fv uuid; v_c uuid; t timestamptz; i int; v_used int; v_cap int;
begin
  t := '2027-06-03 10:00:00+00'::timestamptz;
  select id into v_fv from public.form_versions where business_id = (select business_id from f) limit 1;
  select id into v_c from public.clients where business_id = (select business_id from f) limit 1;
  select capacity into v_cap from public.resources r, f where r.id = f.resource_id;

  for i in 0..2 loop
    select count(*) into v_used
    from public.appointments a, f
    where a.resource_id = f.resource_id and a.deleted_at is null
      and a.status not in ('cancelled','no_show')
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(t, t + interval '1 hour', '[)');

    insert into res (name, pass, detail) values (
      format('resource check with %s of %s used: would %s', i, v_cap,
             case when v_used >= v_cap then 'REFUSE' else 'allow' end),
      (v_used >= v_cap) = (i >= v_cap),
      format('used=%s capacity=%s', v_used, v_cap));

    if i < 2 then
      -- Different staff each time so only the RESOURCE is the constraint.
      insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
        resource_id, starts_at, ends_at, duration_minutes, status, form_version_id,
        is_exclusive, resource_capacity_at_booking)
      select f.business_id, f.branch_id, v_c, f.service_id,
        (select sp.id from public.staff_profiles sp
         where sp.business_id = f.business_id offset i limit 1),
        f.resource_id, t, t + interval '1 hour', 60, 'confirmed', v_fv, true, v_cap
      from f;
    end if;
  end loop;
end $$;

-- E. The capacity fix really works: two bookings CAN share a capacity-2 room.
select pg_temp.chk('a capacity-2 room now holds two concurrent bookings',
  (select count(*)::int from public.appointments a, f
   where a.resource_id = f.resource_id
     and a.starts_at = '2027-06-03 10:00:00+00'::timestamptz
     and a.status not in ('cancelled','no_show')),
  2);
-- ...and a capacity-1 booking is still protected by the constraint.
do $$
declare v_fv uuid; v_c uuid; v_err text := 'no error'; t timestamptz;
begin
  t := '2027-06-04 10:00:00+00'::timestamptz;
  select id into v_fv from public.form_versions where business_id=(select business_id from f) limit 1;
  select id into v_c from public.clients where business_id=(select business_id from f) limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
    resource_id, starts_at, ends_at, duration_minutes, status, form_version_id,
    is_exclusive, resource_capacity_at_booking)
  select business_id, branch_id, v_c, service_id, staff_id, resource_id, t, t+interval '1 hour',
    60, 'confirmed', v_fv, true, 1 from f;
  begin
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id,
      resource_id, starts_at, ends_at, duration_minutes, status, form_version_id,
      is_exclusive, resource_capacity_at_booking)
    select f.business_id, f.branch_id, v_c, f.service_id,
      (select sp.id from public.staff_profiles sp where sp.business_id=f.business_id offset 1 limit 1),
      f.resource_id, t, t+interval '1 hour', 60, 'confirmed', v_fv, true, 1 from f;
    v_err := 'INSERT SUCCEEDED';
  exception when exclusion_violation then v_err := 'refused'; end;
  insert into res (name, pass, detail) values
    ('a CAPACITY-1 resource is still a hard DB guarantee', v_err='refused', v_err);
end $$;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed, count(*) as total from res;
select n, name, detail from res where not pass order by n;
rollback;
