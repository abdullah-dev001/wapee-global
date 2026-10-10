-- Public booking with several locations (migration 20261022100000): which branches are
-- offered, per-branch catalogue / hours / prices / staff, no availability leaking between
-- branches, refusals that write nothing, and the manage view / message job naming the
-- booked location.
--
--   supabase db query --linked -f supabase/tests/38_public_multi_branch.sql
--
-- Plain SQL, own fixtures, rolled back. The Edge Function layer (branch references, picker,
-- cross-business ids over real HTTP) is proved by 38_multi_branch_http.mjs.
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
create or replace function pg_temp.act_as(p_user uuid, p_aal2 boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', case when p_aal2 then 'aal2' else 'aal1' end)::text, true);
end; $$;

-- Run a jsonb-returning statement as a signed-in user.
create or replace function pg_temp.as_(p_user text, p_sql text, p_aal2 boolean default false) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user), p_aal2);
  set local role authenticated;
  begin
    execute p_sql into r;
  exception when others then
    reset role;
    return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm);
  end;
  reset role;
  return r;
end $$;
-- Run a SCALAR query as a user: its text value, or ERR:<sqlstate>
create or replace function pg_temp.as_q(p_user text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  set local role authenticated;
  begin
    execute p_sql into v;
  exception when others then
    reset role;
    return 'ERR:' || sqlstate;
  end;
  reset role;
  return v;
end $$;
create or replace function pg_temp.as_anon(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    execute p_sql into r;
  exception when others then
    reset role;
    return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm);
  end;
  reset role;
  return r;
end $$;
-- scalar as postgres
create or replace function pg_temp.q(p_sql text) returns text language plpgsql as $$
declare v text;
begin execute p_sql into v; return v; end $$;
-- run a statement as postgres: 'ok' or '<sqlstate>'
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
-- run a statement as a user: 'ok' or '<sqlstate>'
create or replace function pg_temp.try_as(p_user text, p_sql text) returns text language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  set local role authenticated;
  begin execute p_sql; exception when others then reset role; return sqlstate; end;
  reset role; return 'ok';
end $$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated, anon', v_schema);
end $$;

create or replace function pg_temp.rid(p_key text) returns uuid language sql as $$
  select id from public.roles where business_id is null and key = p_key
$$;
create or replace function pg_temp.perms(p_role uuid) returns text language sql as $$
  select coalesce(string_agg(permission || ':' || scope, ',' order by permission), '') from public.role_permissions where role_id = p_role
$$;
create or replace function pg_temp.audit_n(p_action text) returns text language sql as $$
  select count(*)::text from public.audit_logs where action = p_action
$$;
create or replace function pg_temp.member(p_biz text, p_user text) returns uuid language sql as $$
  select id from public.business_members where business_id = pg_temp.id(p_biz) and user_id = pg_temp.id(p_user)
$$;
create or replace function pg_temp.add_member(p_biz text, p_user text, p_role_key text, p_branch text default null) returns uuid language plpgsql as $$
declare v_m uuid;
begin
  select id into v_m from public.business_members where business_id = pg_temp.id(p_biz) and user_id = pg_temp.id(p_user);
  if v_m is null then
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id(p_biz), pg_temp.id(p_user), 'active', now()) returning id into v_m;
  end if;
  insert into public.member_role_assignments (member_id, role_id, branch_id)
  values (v_m, pg_temp.rid(p_role_key), case when p_branch is null then null else pg_temp.id(p_branch) end);
  return v_m;
end $$;



do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('ownerb')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mb.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('Multi Alpha','multi-alpha','GB','GBP','Europe/London','en',null,'Downtown');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('Multi Beta','multi-beta','US','USD','America/New_York','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
end $$;
insert into ids select 'dt', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into ids select 'bb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;
update public.branches set address = '1 High Street, London', invoice_prefix = 'DT' where id = pg_temp.id('dt');

-- Second location "Uptown" (Karachi, PKR), a third that will be archived, and a fourth that is not set up.
insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix, address)
values (pg_temp.id('biza'), 'Uptown', false, 'Asia/Karachi', 'PKR', 'PK', 'UP', '9 Hill Road, Karachi');
insert into ids select 'up', id from public.branches where business_id = pg_temp.id('biza') and name = 'Uptown';
insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix)
values (pg_temp.id('biza'), 'Closed', false, 'Europe/London', 'GBP', 'GB', 'CL');
insert into ids select 'cl', id from public.branches where business_id = pg_temp.id('biza') and name = 'Closed';
insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix)
values (pg_temp.id('biza'), 'Unready', false, 'Europe/London', 'GBP', 'GB', 'UR');
insert into ids select 'ur', id from public.branches where business_id = pg_temp.id('biza') and name = 'Unready';

do $$
declare v_a uuid := pg_temp.id('biza'); v_cut uuid; v_color uuid; v_sa uuid; v_su uuid; v_bsvc uuid; v_bstaff uuid; v_b uuid := pg_temp.id('bizb');
begin
  -- two services: Cut at BOTH locations with different prices; Colour only at Uptown
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_a, 'Cut', 60, 0) returning id into v_cut;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_a, 'Colour', 60, 0) returning id into v_color;
  insert into ids values ('cut', v_cut), ('color', v_color);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values
    (v_cut, pg_temp.id('dt'), v_a, 3000, true), (v_cut, pg_temp.id('up'), v_a, 4500000, true),
    (v_color, pg_temp.id('up'), v_a, 9000000, true),
    (v_cut, pg_temp.id('cl'), v_a, 1000, true);
  -- staff: Sara only at Downtown, Umar only at Uptown, Closed has one too
  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_a, 'Sara', 1) returning id into v_sa;
  insert into public.staff_profiles (business_id, display_name, sort_order) values (v_a, 'Umar', 2) returning id into v_su;
  insert into ids values ('sara', v_sa), ('umar', v_su);
  insert into public.staff_branches (staff_id, branch_id, business_id) values
    (v_sa, pg_temp.id('dt'), v_a), (v_su, pg_temp.id('up'), v_a), (v_sa, pg_temp.id('cl'), v_a);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_cut, v_sa, v_a), (v_cut, v_su, v_a), (v_color, v_su, v_a);
  -- hours: Downtown 09:00-17:00 every day; Uptown 12:00-16:00 (different) every day; Closed 09:00-17:00
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute)
  select pg_temp.id('dt'), v_a, d, 540, 1020 from generate_series(0,6) d
  union all select pg_temp.id('up'), v_a, d, 720, 960 from generate_series(0,6) d
  union all select pg_temp.id('cl'), v_a, d, 540, 1020 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
  select v_sa, pg_temp.id('dt'), v_a, d, 540, 1020 from generate_series(0,6) d
  union all select v_su, pg_temp.id('up'), v_a, d, 720, 960 from generate_series(0,6) d
  union all select v_sa, pg_temp.id('cl'), v_a, d, 540, 1020 from generate_series(0,6) d;
  update public.booking_settings set booking_window_days = 730, minimum_notice_minutes = 0, slot_interval = 'min_60' where business_id = v_a;
  -- Closed: online booking OFF (set_up but switched off); Unready has nothing at all
  update public.booking_settings set online_booking_enabled = false where branch_id = pg_temp.id('cl');
  -- the other business: one bookable branch so the "another business" checks have a target
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_b, 'Other cut', 30, 0) returning id into v_bsvc;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_bsvc, pg_temp.id('bb'), v_b, 2000, true);
  insert into public.staff_profiles (business_id, display_name) values (v_b, 'Bea') returning id into v_bstaff;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_bstaff, pg_temp.id('bb'), v_b);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_bsvc, v_bstaff, v_b);
  insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute) select pg_temp.id('bb'), v_b, d, 540, 1020 from generate_series(0,6) d;
  insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute) select v_bstaff, pg_temp.id('bb'), v_b, d, 540, 1020 from generate_series(0,6) d;
  insert into ids values ('bsvc', v_bsvc), ('bstaff', v_bstaff);
end $$;

create or replace function pg_temp.codes() returns text language sql as $$
  select coalesce(string_agg(b ->> 'code', ',' order by ord), '') from public.get_bookable_branches(pg_temp.id('biza')) j, jsonb_array_elements(j) with ordinality as t(b, ord) $$;
create or replace function pg_temp.slots(p_branch text, p_service text, p_staff text, p_day date) returns text language sql as $$
  select coalesce(string_agg(local_minute::text, ',' order by starts_at), '') from public.get_free_slots(pg_temp.id(p_branch), pg_temp.id(p_service), case when p_staff is null then null else pg_temp.id(p_staff) end, p_day, p_day) $$;

-- ============ 1. which locations are offered ============
select pg_temp.chk('bookable locations: Downtown (primary) then Uptown; archived/off/unready never listed', pg_temp.codes(), 'DT,UP');
select pg_temp.chk('public fields only', (select (get_bookable_branches(pg_temp.id('biza')) -> 1) ?& array['id','name','address','timezone','currency','country_code','is_primary','code'])::text, 'true');
select pg_temp.chk('...and no business id, phone or other columns',
  (select (select count(*) from jsonb_object_keys(public.get_bookable_branches(pg_temp.id('biza')) -> 0)))::text, '8');
select pg_temp.chk('the other business sees only its own location', (select string_agg(b ->> 'name', ',') from jsonb_array_elements(public.get_bookable_branches(pg_temp.id('bizb'))) b), 'Main');
select pg_temp.chk('an unknown business id returns an empty list', public.get_bookable_branches(gen_random_uuid())::text, '[]');
select pg_temp.chk('anon cannot call it', pg_temp.as_anon(format($q$select public.get_bookable_branches(%L)$q$, pg_temp.id('biza'))) ->> 'state', '42501');
select pg_temp.chk('authenticated cannot call it', pg_temp.as_('owner', format($q$select public.get_bookable_branches(%L)$q$, pg_temp.id('biza'))) ->> 'state', '42501');
update public.branches set deleted_at = now() where id = pg_temp.id('up');
select pg_temp.chk('an archived location disappears from the list', pg_temp.codes(), 'DT');
update public.branches set deleted_at = null where id = pg_temp.id('up');
delete from public.staff_working_hours where branch_id = pg_temp.id('up');
select pg_temp.chk('a location whose staff have no hours is not offered (branch_is_bookable)', pg_temp.codes(), 'DT');
insert into public.staff_working_hours (staff_id, branch_id, business_id, day_of_week, start_minute, end_minute)
select pg_temp.id('umar'), pg_temp.id('up'), pg_temp.id('biza'), d, 720, 960 from generate_series(0,6) d;
select pg_temp.chk('...and is back once hours exist', pg_temp.codes(), 'DT,UP');

-- ============ 2. different services, prices, staff, hours per location ============
select pg_temp.chk('Downtown catalogue: Cut at 3000, staff Sara only',
  (select string_agg((s ->> 'name') || '=' || (s ->> 'price_minor'), ',' order by s ->> 'name') from jsonb_array_elements(public.get_booking_page_catalogue(pg_temp.id('dt')) -> 'services') s) || '|' ||
  (select string_agg(s ->> 'display_name', ',') from jsonb_array_elements(public.get_booking_page_catalogue(pg_temp.id('dt')) -> 'staff') s), 'Cut=3000|Sara');
select pg_temp.chk('Uptown catalogue: Colour 9000000 and Cut 4500000, staff Umar only',
  (select string_agg((s ->> 'name') || '=' || (s ->> 'price_minor'), ',' order by s ->> 'name') from jsonb_array_elements(public.get_booking_page_catalogue(pg_temp.id('up')) -> 'services') s) || '|' ||
  (select string_agg(s ->> 'display_name', ',') from jsonb_array_elements(public.get_booking_page_catalogue(pg_temp.id('up')) -> 'staff') s), 'Colour=9000000,Cut=4500000|Umar');
select pg_temp.chk('Downtown offers 8 hourly slots from 09:00 (minutes 540..960)', pg_temp.slots('dt', 'cut', null, '2027-06-15'), '540,600,660,720,780,840,900,960');
select pg_temp.chk('Uptown offers 4 hourly slots from 12:00 (720..900): different hours', pg_temp.slots('up', 'cut', null, '2027-06-15'), '720,780,840,900');
select pg_temp.chk('Colour is not offered at Downtown at all', pg_temp.slots('dt', 'color', null, '2027-06-15'), '');
select pg_temp.chk('Sara (Downtown) is not offered at Uptown even when asked for by id', pg_temp.slots('up', 'cut', 'sara', '2027-06-15'), '');
select pg_temp.chk('...nor Umar at Downtown', pg_temp.slots('dt', 'cut', 'umar', '2027-06-15'), '');
select pg_temp.chk('first Uptown slot is 12:00 Karachi = 07:00Z (the branch time zone, not Downtown''s)',
  (select starts_at::text from public.get_free_slots(pg_temp.id('up'), pg_temp.id('cut'), null, '2027-06-15', '2027-06-15') order by starts_at limit 1), '2027-06-15 07:00:00+00');
select pg_temp.chk('first Downtown slot is 09:00 BST = 08:00Z',
  (select starts_at::text from public.get_free_slots(pg_temp.id('dt'), pg_temp.id('cut'), null, '2027-06-15', '2027-06-15') order by starts_at limit 1), '2027-06-15 08:00:00+00');

-- ============ 3. booking one location does not leak into another ============
do $$
declare r jsonb; v_before int;
begin
  -- 13:00 Karachi (08:00Z) at Uptown with Umar
  r := public.create_booking(pg_temp.id('up'), pg_temp.id('cut'), '2027-06-15 08:00:00+00', pg_temp.id('umar'), 'Karachi Kim', '+923001234567', 'kim@example.com', null, '[]'::jsonb, repeat('a', 64));
  perform pg_temp.chk('booking at Uptown: ok', r ->> 'ok', 'true');
  insert into ids values ('appt_up', (r ->> 'appointment_id')::uuid);
  perform pg_temp.chk('...stored on the UPTOWN branch with Uptown''s price and currency',
    (select branch_id = pg_temp.id('up') and price_minor = 4500000 and staff_id = pg_temp.id('umar') from public.appointments where id = pg_temp.id('appt_up'))::text, 'true');
  perform pg_temp.chk('...currency of the answer is Uptown''s (PKR) and the branch name is Uptown', (r ->> 'currency') || '/' || (r ->> 'branch_name'), 'PKR/Uptown');
  perform pg_temp.chk('...Uptown''s 13:00 slot is gone', pg_temp.slots('up', 'cut', null, '2027-06-15'), '720,840,900');
  perform pg_temp.chk('...Downtown is untouched (same instant is 09:00 BST: still 8 slots, Sara free)', pg_temp.slots('dt', 'cut', null, '2027-06-15'), '540,600,660,720,780,840,900,960');

  -- the same UTC instant at Downtown with Sara is a different person, so it is allowed
  r := public.create_booking(pg_temp.id('dt'), pg_temp.id('cut'), '2027-06-15 08:00:00+00', pg_temp.id('sara'), 'London Lou', '+447700900123', null, null, '[]'::jsonb, repeat('b', 64));
  perform pg_temp.chk('booking at Downtown at the same instant: ok', r ->> 'ok', 'true');
  insert into ids values ('appt_dt', (r ->> 'appointment_id')::uuid);
  perform pg_temp.chk('...stored on DOWNTOWN with its price (3000) and branch', (select (branch_id = pg_temp.id('dt') and price_minor = 3000)::text from public.appointments where id = pg_temp.id('appt_dt')), 'true');
  perform pg_temp.chk('...and Uptown still has its other slots', pg_temp.slots('up', 'cut', null, '2027-06-15'), '720,840,900');
  perform pg_temp.chk('the two clients are separate people with their own phone', (select count(distinct client_id)::text from public.appointments where id in (pg_temp.id('appt_up'), pg_temp.id('appt_dt'))), '2');

  -- failure paths: nothing is written
  select count(*) into v_before from public.appointments where business_id = pg_temp.id('biza');
  r := public.create_booking(pg_temp.id('dt'), pg_temp.id('color'), '2027-06-16 08:00:00+00', null, 'X', '+447700900124', null, null, '[]'::jsonb, repeat('c', 64));
  perform pg_temp.chk('Colour at Downtown (not offered there): refused', (r ->> 'ok') || '/' || coalesce(r ->> 'code', ''), 'false/service_unavailable');
  r := public.create_booking(pg_temp.id('dt'), pg_temp.id('cut'), '2027-06-16 08:00:00+00', pg_temp.id('umar'), 'X', '+447700900124', null, null, '[]'::jsonb, repeat('d', 64));
  perform pg_temp.chk('Umar (Uptown staff) at Downtown: refused', (r ->> 'ok') || '/' || coalesce(r ->> 'code', ''), 'false/staff_unavailable');
  r := public.create_booking(pg_temp.id('bb'), pg_temp.id('cut'), '2027-06-16 14:00:00+00', null, 'X', '+447700900124', null, null, '[]'::jsonb, repeat('e', 64));
  perform pg_temp.chk('another business''s branch with this business''s service: refused', (r ->> 'ok')::text, 'false');
  r := public.create_booking(pg_temp.id('up'), pg_temp.id('bsvc'), '2027-06-16 08:00:00+00', null, 'X', '+447700900124', null, null, '[]'::jsonb, repeat('f', 64));
  perform pg_temp.chk('another business''s service at this business''s branch: refused', (r ->> 'ok')::text, 'false');
  perform pg_temp.chk('...none of the refusals created an appointment or a client',
    (select count(*)::text from public.appointments where business_id = pg_temp.id('biza')) || '/' ||
    (select count(*)::text from public.clients where business_id = pg_temp.id('biza') and full_name = 'X'), (v_before::text) || '/0');
end $$;

-- ============ 4. manage view + messages use the booked location ============
do $$
declare v_tok text := repeat('9', 64); r jsonb; v_job jsonb; v_out uuid;
begin
  r := public.create_booking(pg_temp.id('up'), pg_temp.id('color'), '2027-06-17 08:00:00+00', pg_temp.id('umar'), 'Kim Again', '+923001234567', 'kim@example.com', null, '[]'::jsonb, v_tok);
  perform pg_temp.chk('second Uptown booking ok', r ->> 'ok', 'true');
  r := public.get_booking(v_tok);
  perform pg_temp.chk('manage view: Uptown name, address and Karachi time zone',
    (r ->> 'branch_name') || '|' || (r ->> 'branch_address') || '|' || (r ->> 'timezone') || '|' || (r ->> 'local_minute'), 'Uptown|9 Hill Road, Karachi|Asia/Karachi|780');
  perform pg_temp.chk('...currency is the branch''s', r ->> 'currency', 'PKR');

  select o.id into v_out from public.message_outbox o
   where o.appointment_id = (select a.id from public.appointments a where a.client_id = (select id from public.clients where business_id = pg_temp.id('biza') and phone_e164 = '+923001234567') and a.starts_at = '2027-06-17 08:00:00+00')
     and o.channel = 'email' order by o.created_at limit 1;
  perform pg_temp.chk('a confirmation email was queued', (v_out is not null)::text, 'true');
  v_job := public.outbox_job(v_out);
  perform pg_temp.chk('message job: branch name, address, Karachi time zone and the live location count (Downtown, Uptown, Closed, Unready = 4)',
    (v_job ->> 'branch_name') || '|' || (v_job ->> 'branch_address') || '|' || (v_job ->> 'timezone') || '|' || (v_job ->> 'branch_count'),
    'Uptown|9 Hill Road, Karachi|Asia/Karachi|4');
  perform pg_temp.chk('...and it belongs to the Uptown branch', (select branch_id = pg_temp.id('up') from public.message_outbox where id = v_out)::text, 'true');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
