-- F11 (QA run 2026-10-17): no no-show before the appointment starts; an
-- early 'completed' is still allowed (the dashboard warns).
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/47_no_show_not_before_start.sql
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
    'f11.owner@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  insert into ids values ('owner', v_owner);

  perform pg_temp.act_as(v_owner);
  set local role authenticated;
  v_biz := public.create_business_with_owner('F11 Lab','f11-lab-check','GB','GBP','Europe/London','en',null,'Main');
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

-- A future appointment and a past one (past inserted directly: the RPC
-- cannot book in the past).
do $$
declare r jsonb; v_fv uuid; v_client uuid; v_past uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.create_appointment(pg_temp.id('br'), pg_temp.id('svc'), pg_temp.at(1, 600), pg_temp.id('ann'), null,
                                 'Future Client', '07700 900501');
  reset role;
  insert into ids values ('future', (r->>'appointment_id')::uuid);
  perform pg_temp.chk('setup: future booking ok', r->>'ok', 'true');

  select client_id into v_client from public.appointments where id = pg_temp.id('future');
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biz') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at,
                                   duration_minutes, status, form_version_id, is_exclusive)
  values (pg_temp.id('biz'), pg_temp.id('br'), v_client, pg_temp.id('svc'), pg_temp.id('ann'),
          now() - interval '2 hours', now() - interval '1 hour', 60, 'confirmed', v_fv, true)
  returning id into v_past;
  insert into ids values ('past', v_past);
end $$;

create temporary table snap on commit drop as
  select id, status::text, updated_at from public.appointments where id = pg_temp.id('future');
grant select on snap to authenticated;

do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.mark_no_show(pg_temp.id('future'));
  reset role;
  perform pg_temp.chk('future no-show: refused', r->>'ok', 'false');
  perform pg_temp.chk('future no-show: code not_started', r->>'code', 'not_started');
end $$;
select pg_temp.chk('future no-show: the row is exactly as it was',
  (select row(a.status::text, a.updated_at)::text from public.appointments a where a.id = pg_temp.id('future')),
  (select row(s.status, s.updated_at)::text from snap s));
select pg_temp.chk('future no-show: no audit entry written',
  (select count(*)::int from public.audit_logs where entity_id = pg_temp.id('future')::text and action = 'appointment.no_show'), 0);

do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.mark_no_show(pg_temp.id('past'));
  reset role;
  perform pg_temp.chk('past no-show: allowed', r->>'ok', 'true');
end $$;
select pg_temp.chk('past no-show: stored as no_show',
  (select status::text from public.appointments where id = pg_temp.id('past')), 'no_show');

do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  set local role authenticated;
  r := public.mark_completed(pg_temp.id('future'));
  reset role;
  perform pg_temp.chk('future complete: still allowed (early visit / walk-in)', r->>'ok', 'true');
end $$;
select pg_temp.chk('future complete: stored as completed',
  (select status::text from public.appointments where id = pg_temp.id('future')), 'completed');

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total
from res;

select n, name, detail from res where not pass order by n;

rollback;
