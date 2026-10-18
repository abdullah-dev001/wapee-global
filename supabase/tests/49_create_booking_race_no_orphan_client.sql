-- QA follow-up to F9: a public create_booking that loses the race on the
-- no-double-booking constraint must not leave the client behind.
--
-- The race is simulated with a test-only BEFORE INSERT trigger that raises the
-- constraint's SQLSTATE (23P01) for a marked booking: the same path a real
-- concurrent insert takes inside the begin/exception block.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/49_create_booking_race_no_orphan_client.sql
--
-- Plain SQL, as the Owner via request.jwt.claims. ROLLS BACK. Asserts STORED
-- rows, not only return codes (CLAUDE.md section 5).
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
create or replace function pg_temp.at(p_day int, p_minute int) returns timestamptz language sql stable as $$
  select (((date_trunc('week', (now() at time zone 'Europe/London')::date + 7))::date + p_day)::timestamp
          + make_interval(mins => p_minute)) at time zone 'Europe/London';
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

do $$
declare v_owner uuid := gen_random_uuid(); v_biz uuid; v_br uuid; v_svc uuid; v_ann uuid; v_other_svc uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'f9b.owner@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  insert into ids values ('owner', v_owner);

  perform pg_temp.act_as(v_owner);
  set local role authenticated;
  v_biz := public.create_business_with_owner('F9b Lab','f9b-lab-check','GB','GBP','Europe/London','en',null,'Main');
  reset role;
  insert into ids values ('biz', v_biz);
  select id into v_br from public.branches where business_id = v_biz;
  insert into ids values ('br', v_br);

  insert into public.services (business_id, name, duration_minutes, buffer_minutes)
  values (v_biz, 'Consult', 60, 0) returning id into v_svc;
  insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_svc, v_br, v_biz, 4500, true);
  -- A service nobody performs (for the no_staff path).
  insert into public.services (business_id, name, duration_minutes) values (v_biz, 'Nobody', 60) returning id into v_other_svc;
  insert into ids values ('svc_nobody', v_other_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled)
  values (v_other_svc, v_br, v_biz, 1000, true);

  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_biz, 'Ann', 1) returning id into v_ann;
  insert into ids values ('ann', v_ann);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz);
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_br, v_biz, d, 540, 1020 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_ann, v_br, v_biz, d, 540, 1020 from generate_series(0,6) d;
  update public.booking_settings set minimum_notice_minutes = 0, booking_window_days = 365, slot_interval = 'min_60'
  where branch_id = v_br;

  -- An existing client with NO email (to prove a refused booking does not fill it).
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id, source)
  values (v_biz, 'Existing Person', '+447700900400', v_br, 'dashboard');
end $$;

create or replace function pg_temp.force_race() returns trigger language plpgsql as $$
begin
  if new.client_notes = 'force-race' then
    raise exclusion_violation using message = 'simulated lost race';
  end if;
  return new;
end $$;
create trigger zz_test_force_race before insert on public.appointments
  for each row execute function pg_temp.force_race();

create temporary table before_counts on commit drop as
  select (select count(*) from public.clients where business_id = pg_temp.id('biz')) as clients;

-- 1. A NEW phone loses the race -> slot_taken and no client.
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(1, 600), pg_temp.id('ann'),
                             'Race Loser', '07700 900701', 'race@example.com', 'force-race');
  perform pg_temp.chk('race: refused', r->>'ok', 'false');
  perform pg_temp.chk('race: code slot_taken', r->>'code', 'slot_taken');
end $$;
select pg_temp.chk('race: the new client was NOT created',
  (select count(*)::int from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900701'), 0);

-- 2. An EXISTING client (no email) loses the race -> email left empty.
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(1, 660), pg_temp.id('ann'),
                             'Existing Person', '07700 900400', 'filled@example.com', 'force-race');
  perform pg_temp.chk('race existing: refused', r->>'code', 'slot_taken');
end $$;
select pg_temp.chk('race existing: email still empty',
  (select email::text from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900400'), null::text);
select pg_temp.chk('race: client count unchanged',
  (select count(*)::int from public.clients where business_id = pg_temp.id('biz')), (select clients::int from before_counts));

-- 3. The normal path still creates the client and fills an empty email.
do $$
declare r jsonb;
begin
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(2, 600), pg_temp.id('ann'),
                             'Winner', '07700 900702', 'winner@example.com');
  perform pg_temp.chk('normal: ok', r->>'ok', 'true');
  r := public.create_booking(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(2, 660), pg_temp.id('ann'),
                             'Existing Person', '07700 900400', 'filled@example.com');
  perform pg_temp.chk('normal existing: ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('normal: new client created with email',
  (select email::text from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900702'), 'winner@example.com');
select pg_temp.chk('normal: existing client''s empty email filled',
  (select email::text from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900400'), 'filled@example.com');

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total
from res;

select n, name, detail from res where not pass order by n;

rollback;
