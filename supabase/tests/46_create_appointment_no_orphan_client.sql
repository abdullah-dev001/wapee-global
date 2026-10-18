-- F9 (QA run 2026-10-17): a refused dashboard booking must not create (or
-- change) the client.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/46_create_appointment_no_orphan_client.sql
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
    'f9.owner@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  insert into ids values ('owner', v_owner);

  perform pg_temp.act_as(v_owner);
  set local role authenticated;
  v_biz := public.create_business_with_owner('F9 Lab','f9-lab-check','GB','GBP','Europe/London','en',null,'Main');
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

-- The slot that will be taken.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(0, 600), pg_temp.id('ann'), null,
                                 'First Booker', '07700 900401');
  reset role;
  perform pg_temp.chk('setup: first booking ok', r->>'ok', 'true');
end $$;

create temporary table before_counts on commit drop as
  select (select count(*) from public.clients where business_id = pg_temp.id('biz')) as clients,
         (select count(*) from public.appointments where business_id = pg_temp.id('biz')) as appts;
grant select on before_counts to authenticated;

-- 1. Same staff + same time, NEW client -> refused, no client.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(0, 600), pg_temp.id('ann'), null,
                                 'QA Clash Client', '07700 900402', 'clash@example.com');
  reset role;
  perform pg_temp.chk('clash: refused', r->>'ok', 'false');
  perform pg_temp.chk('clash: code slot_unavailable', r->>'code', 'slot_unavailable');
end $$;
select pg_temp.chk('clash: the new client was NOT created',
  (select count(*)::int from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900402'), 0);

-- 2. A staff member who does not do the service -> refused, no client.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc_nobody'), pg_temp.at(1, 600), pg_temp.id('ann'), null,
                                 'Wrong Staff', '07700 900403');
  reset role;
  perform pg_temp.chk('wrong staff: refused', r->>'code', 'staff_unavailable');
end $$;
select pg_temp.chk('wrong staff: no client created',
  (select count(*)::int from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900403'), 0);

-- 3. "Any staff" for a service nobody performs -> no_staff, no client.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc_nobody'), pg_temp.at(1, 660), null, null,
                                 'Nobody Free', '07700 900404');
  reset role;
  perform pg_temp.chk('no staff: refused', r->>'code', 'no_staff');
end $$;
select pg_temp.chk('no staff: no client created',
  (select count(*)::int from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900404'), 0);

-- 4. Refused booking for an EXISTING client must not fill their empty email.
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(0, 600), pg_temp.id('ann'), null,
                                 'Existing Person', '07700 900400', 'filled@example.com');
  reset role;
  perform pg_temp.chk('existing client clash: refused', r->>'ok', 'false');
end $$;
select pg_temp.chk('existing client clash: email left empty (row unchanged)',
  (select email::text from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900400'), null::text);

select pg_temp.chk('after all refusals: client count unchanged',
  (select count(*)::int from public.clients where business_id = pg_temp.id('biz')),
  (select clients::int from before_counts));
select pg_temp.chk('after all refusals: appointment count unchanged',
  (select count(*)::int from public.appointments where business_id = pg_temp.id('biz')),
  (select appts::int from before_counts));

-- 5. Success still creates the client and links it; an existing client's
--    empty email IS filled on success (behaviour kept).
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(2, 600), pg_temp.id('ann'), null,
                                 'Brand New', '07700 900405', 'new@example.com');
  perform pg_temp.chk('success new client: ok', r->>'ok', 'true');
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(3, 600), pg_temp.id('ann'), null,
                                 'Existing Person', '07700 900400', 'filled@example.com');
  reset role;
  perform pg_temp.chk('success existing client: ok', r->>'ok', 'true');
end $$;
select pg_temp.chk('success: the new client exists with its email',
  (select email::text from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900405'), 'new@example.com');
select pg_temp.chk('success: the appointment points at that client',
  (select count(*)::int from public.appointments a join public.clients c on c.id = a.client_id
   where c.phone_e164 = '+447700900405' and a.starts_at = pg_temp.at(2, 600)), 1);
select pg_temp.chk('success: existing client''s empty email is filled',
  (select email::text from public.clients where business_id = pg_temp.id('biz') and phone_e164 = '+447700900400'), 'filled@example.com');

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total
from res;

select n, name, detail from res where not pass order by n;

rollback;
