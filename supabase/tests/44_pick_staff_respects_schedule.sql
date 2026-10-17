-- F1 (QA run 2026-10-17): "Any available person" must pick someone who is
-- actually free per the slot engine (hours, breaks, time off, closures).
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/44_pick_staff_respects_schedule.sql
--   (local: supabase db query -f ...)
--
-- Plain SQL. Builds its own fixtures, asserts into a temp table, ROLLS BACK.
--
-- Setup: one London branch open 09:00-17:00 every day, a 60-minute service,
-- two staff: Ann (sort 1) and Bob (sort 2), both normally 09:00-17:00. Ann is
-- always the tie-break winner, so every case below is one where the OLD rule
-- (least busy, then sort order, only checking overlapping appointments) would
-- have picked Ann although she is not working.
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got::text is not distinct from p_want::text,
          'got ' || coalesce(p_got::text,'<null>') || ' want ' || coalesce(p_want::text,'<null>'));
end; $$;
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end; $$;
-- Local date of "Monday next week + p_day days", London.
create or replace function pg_temp.d(p_day int) returns date language sql stable as $$
  select (date_trunc('week', (now() at time zone 'Europe/London')::date + 7))::date + p_day;
$$;
-- A London wall-clock time on that day.
create or replace function pg_temp.at(p_day int, p_minute int) returns timestamptz language sql stable as $$
  select (pg_temp.d(p_day)::timestamp + make_interval(mins => p_minute)) at time zone 'Europe/London';
$$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated, anon', v_schema);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
do $$
declare v_owner uuid := gen_random_uuid(); v_biz uuid; v_br uuid; v_svc uuid; v_ann uuid; v_bob uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'f1.owner@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  insert into ids values ('owner', v_owner);

  perform pg_temp.act_as(v_owner);
  set local role authenticated;
  v_biz := public.create_business_with_owner('F1 Lab','f1-lab-check','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('biz', v_biz);
  select id into v_br from public.branches where business_id = v_biz;
  insert into ids values ('br', v_br);

  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (v_biz, 'Consult', 60, 0) returning id into v_svc;
  insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, v_br, v_biz, 4500, true);

  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_biz, 'Ann', 1) returning id into v_ann;
  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_biz, 'Bob', 2) returning id into v_bob;
  insert into ids values ('ann', v_ann), ('bob', v_bob);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz), (v_bob, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz), (v_svc, v_bob, v_biz);

  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_br, v_biz, d, 540, 1020 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select s, v_br, v_biz, d, 540, 1020 from generate_series(0,6) d, (values (v_bob)) x(s);
  -- Ann: normal hours except day 1 (Tuesday), when she works 13:00-17:00 only.
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_ann, v_br, v_biz, d, case when d = extract(dow from pg_temp.d(1))::int then 780 else 540 end, 1020
  from generate_series(0,6) d;

  -- Day 0 (Monday): Ann whole-day time off.
  insert into public.staff_time_off (staff_id, business_id, branch_id, starts_at, ends_at, is_all_day)
  values (v_ann, v_biz, v_br, pg_temp.at(0, 0), pg_temp.at(1, 0), true);
  -- Day 2 (Wednesday): Ann has a break 10:00-11:00.
  insert into public.staff_breaks (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute, label)
  values (v_ann, v_br, v_biz, extract(dow from pg_temp.d(2))::int, 600, 660, 'Lunch');
  -- Day 3 (Thursday): the branch is closed.
  insert into public.branch_closures (branch_id, business_id, starts_on, ends_on, name)
  values (v_br, v_biz, pg_temp.d(3), pg_temp.d(3), 'Training');
  -- Day 4 (Friday): Ann time off all day, Bob already booked at 10:00 (below).
  insert into public.staff_time_off (staff_id, business_id, branch_id, starts_at, ends_at, is_all_day)
  values (v_ann, v_biz, v_br, pg_temp.at(4, 0), pg_temp.at(5, 0), true);

  update public.booking_settings
  set minimum_notice_minutes = 0, booking_window_days = 365, slot_interval = 'min_60'
  where branch_id = v_br;
end $$;

-- ---------------------------------------------------------------------------
-- The engine agrees with the fixture (sanity)
-- ---------------------------------------------------------------------------
select pg_temp.chk('engine: Ann has no slots on her day off',
  (select count(*)::int from public.get_free_slots(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.id('ann'), pg_temp.d(0), pg_temp.d(0))), 0);
select pg_temp.chk('engine: Bob has 10:00 on that day',
  (select count(*)::int from public.get_free_slots(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.id('bob'), pg_temp.d(0), pg_temp.d(0))
   where starts_at = pg_temp.at(0, 600)), 1);

-- ---------------------------------------------------------------------------
-- 1. Time off (the QA reproduction)
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(0, 600), null,
                             'Time Off Case', '07700 900301', 'a@example.com');
  perform pg_temp.chk('time off: "any staff" booking succeeds', r->>'ok', 'true');
  perform pg_temp.chk('time off: it goes to Bob, not Ann on her day off', r->>'staff_name', 'Bob');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Different working hours
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(1, 600), null,
                             'Hours Case', '07700 900302');
  perform pg_temp.chk('hours: 10:00 when Ann starts at 13:00 succeeds', r->>'ok', 'true');
  perform pg_temp.chk('hours: and goes to Bob', r->>'staff_name', 'Bob');

  -- 14:00: both work; Ann has 0 bookings that day, Bob 1 => Ann.
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(1, 840), null,
                             'Hours Case Two', '07700 900303');
  perform pg_temp.chk('hours: inside both schedules the least-loaded still wins (Ann)', r->>'staff_name', 'Ann');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Breaks
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(2, 600), null,
                             'Break Case', '07700 900304');
  perform pg_temp.chk('break: 10:00 during Ann''s break succeeds', r->>'ok', 'true');
  perform pg_temp.chk('break: and goes to Bob', r->>'staff_name', 'Bob');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Branch closure: nobody is free; nothing is written
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(3, 600), null,
                             'Closure Case', '07700 900305');
  perform pg_temp.chk('closure: refused', r->>'ok', 'false');
  perform pg_temp.chk('closure: code no_staff', r->>'code', 'no_staff');
end $$;
select pg_temp.chk('closure: no appointment written that day',
  (select count(*)::int from public.appointments where branch_id = pg_temp.id('br') and starts_at = pg_temp.at(3, 600)), 0);
select pg_temp.chk('closure: no client created for the refused phone',
  (select count(*)::int from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900305'), 0);

-- ---------------------------------------------------------------------------
-- 5. The only on-duty person is booked: refused, nothing written
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(4, 600), pg_temp.id('bob'),
                             'Bob Busy', '07700 900306');
  perform pg_temp.chk('friday: Bob booked at 10:00', r->>'ok', 'true');
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(4, 600), null,
                             'Nobody Free', '07700 900307');
  perform pg_temp.chk('friday: "any staff" at a taken time is refused', r->>'ok', 'false');
  perform pg_temp.chk('friday: code no_staff (Ann is off, not double-booked)', r->>'code', 'no_staff');
end $$;
select pg_temp.chk('friday: exactly one appointment at 10:00 (Bob''s)',
  (select count(*)::int from public.appointments where branch_id = pg_temp.id('br') and starts_at = pg_temp.at(4, 600)
   and status not in ('cancelled','no_show')), 1);
select pg_temp.chk('friday: no client created for the refused phone',
  (select count(*)::int from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900307'), 0);
select pg_temp.chk('friday: Ann has no appointment on her day off',
  (select count(*)::int from public.appointments where staff_id = pg_temp.id('ann')
   and starts_at >= pg_temp.at(4, 0) and starts_at < pg_temp.at(5, 0)), 0);

-- ---------------------------------------------------------------------------
-- 6. pick_staff_for_slot directly
-- ---------------------------------------------------------------------------
select pg_temp.chk('pick: strict default returns null when nobody is on schedule (closure)',
  public.pick_staff_for_slot(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(3, 600), pg_temp.at(3, 660)), null::uuid);
select pg_temp.chk('pick: off-schedule fallback (dashboard) still finds someone on a closure day',
  public.pick_staff_for_slot(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(3, 600), pg_temp.at(3, 660), true) is not null, true);
select pg_temp.chk('pick: anon cannot execute it',
  has_function_privilege('anon', 'public.pick_staff_for_slot(uuid,uuid,timestamptz,timestamptz,boolean)', 'execute'), false);
select pg_temp.chk('pick: authenticated cannot execute it',
  has_function_privilege('authenticated', 'public.pick_staff_for_slot(uuid,uuid,timestamptz,timestamptz,boolean)', 'execute'), false);
select pg_temp.chk('pick: the old 4-argument overload is gone',
  (select count(*)::int from pg_proc where proname = 'pick_staff_for_slot' and pronargs = 4), 0);

-- ---------------------------------------------------------------------------
-- 7. Dashboard "Any staff" (create_appointment, as the owner)
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  -- Wednesday 11:00: both on schedule, both 0 bookings? Bob has 1 (10:00) => Ann.
  -- Tuesday 11:00: Ann not yet working => Bob, even though Ann wins every tie.
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(1, 660), null, null,
                                 'Desk Any', '07700 900308');
  reset role;
  perform pg_temp.chk('dashboard any-staff: ok', r->>'ok', 'true');
  perform pg_temp.chk('dashboard any-staff: picks the on-duty Bob', (r->>'staff_id')::uuid, pg_temp.id('bob'));

  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  -- Monday 20:00: nobody is on schedule; the dashboard may still book off-hours.
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(0, 1200), null, null,
                                 'Desk Late', '07700 900309');
  reset role;
  perform pg_temp.chk('dashboard any-staff off-hours: still allowed (fallback)', r->>'ok', 'true');
end $$;

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total
from res;

select n, name, detail from res where not pass order by n;

rollback;
