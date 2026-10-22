-- Phase 9B part 1: branch-scoped permissions (staff, services, custom fields,
-- clients, audit log) and the report-email payload purge.
--
--   supabase db query --linked -f supabase/tests/21_branch_scope.sql
--
-- Plain SQL, own fixtures, rolled back. A role assigned to branch A must not
-- touch branch B's staff / services / custom fields / clients, nor read the whole
-- audit log. Every role is tried: owner, manager A, manager B (Karachi),
-- receptionist A, staff A (own scope), a custom role with settings.business at ONE
-- branch and one at ALL scope, and another business.
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
  for r in select * from (values ('owner'),('mgra'),('mgrk'),('recep'),('staffa'),('cust1'),('custall'),('ownerb'),('mgrb')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p9bt.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P9B Alpha','p9b-alpha','GB','GBP','Europe/London','en',null,'Alpha');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P9B Beta','p9b-beta','US','USD','America/New_York','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
end $$;
insert into ids select 'bra', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix) values (pg_temp.id('biza'), 'Bravo', false, 'Asia/Karachi', 'PKR', 'PK', 'BRV');
insert into ids select 'brb', id from public.branches where business_id = pg_temp.id('biza') and name = 'Bravo';

select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('biza', 'mgra', 'manager', 'bra');
select pg_temp.add_member('biza', 'mgrk', 'manager', 'brb');
select pg_temp.add_member('biza', 'recep', 'receptionist', 'bra');
select pg_temp.add_member('biza', 'staffa', 'staff', 'bra');
select pg_temp.add_member('biza', 'cust1', 'staff', 'bra');
select pg_temp.add_member('biza', 'custall', 'staff', 'bra');
-- custom roles (as postgres, trusted) with settings.business at ONE branch / ALL scope
do $$
declare v_r1 uuid; v_r2 uuid;
begin
  insert into public.roles (business_id, key, name, is_system) values (pg_temp.id('biza'), 'c_one', 'Settings one', false) returning id into v_r1;
  insert into public.role_permissions values (v_r1, 'settings.business', 'branch'), (v_r1, 'staff.manage', 'branch'), (v_r1, 'services.manage', 'branch'), (v_r1, 'settings.booking', 'branch'), (v_r1, 'clients.view', 'branch'), (v_r1, 'clients.edit', 'branch');
  insert into public.roles (business_id, key, name, is_system) values (pg_temp.id('biza'), 'c_all', 'Settings all', false) returning id into v_r2;
  insert into public.role_permissions values (v_r2, 'settings.business', 'all'), (v_r2, 'staff.manage', 'all'), (v_r2, 'services.manage', 'all'), (v_r2, 'settings.booking', 'all'), (v_r2, 'clients.view', 'all'), (v_r2, 'clients.edit', 'all');
  delete from public.member_role_assignments where member_id in (pg_temp.member('biza', 'cust1'), pg_temp.member('biza', 'custall'));
  insert into public.member_role_assignments (member_id, role_id, branch_id) values (pg_temp.member('biza', 'cust1'), v_r1, pg_temp.id('bra')), (pg_temp.member('biza', 'custall'), v_r2, null);
end $$;

-- data: staff, services, fields, clients, appointments
do $$
declare v_fv uuid; v_svc uuid; v_c uuid; k text;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.staff_profiles (business_id, display_name, is_active, member_id) values (pg_temp.id('biza'), 'Staff A', true, pg_temp.member('biza', 'staffa')) returning id into v_c; insert into ids values ('s_a', v_c);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_c, pg_temp.id('bra'), pg_temp.id('biza'));
  insert into public.staff_profiles (business_id, display_name, is_active) values (pg_temp.id('biza'), 'Staff B', true) returning id into v_c; insert into ids values ('s_b', v_c);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_c, pg_temp.id('brb'), pg_temp.id('biza'));
  insert into public.staff_profiles (business_id, display_name, is_active) values (pg_temp.id('biza'), 'Staff AB', true) returning id into v_c; insert into ids values ('s_ab', v_c);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_c, pg_temp.id('bra'), pg_temp.id('biza')), (v_c, pg_temp.id('brb'), pg_temp.id('biza'));
  insert into public.staff_profiles (business_id, display_name, is_active) values (pg_temp.id('biza'), 'Staff None', true) returning id into v_c; insert into ids values ('s_none', v_c);
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('biza'), 'Cut', 30, 0) returning id into v_svc; insert into ids values ('svc', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, pg_temp.id('bra'), pg_temp.id('biza'), 1000, true), (v_svc, pg_temp.id('brb'), pg_temp.id('biza'), 100000, true);
  insert into public.service_categories (business_id, name) values (pg_temp.id('biza'), 'Hair') returning id into v_c; insert into ids values ('cat', v_c);
  insert into public.custom_fields (business_id, label, field_type, is_required, applies_to_all_services) values (pg_temp.id('biza'), 'Allergies', 'short_text', false, true) returning id into v_c; insert into ids values ('cf', v_c);
  insert into public.staff_time_off (business_id, staff_id, starts_at, ends_at) values (pg_temp.id('biza'), pg_temp.id('s_b'), now() + interval '10 days', now() + interval '11 days') returning id into v_c; insert into ids values ('to_b', v_c);
  insert into public.staff_time_off (business_id, staff_id, starts_at, ends_at) values (pg_temp.id('biza'), pg_temp.id('s_a'), now() + interval '10 days', now() + interval '11 days') returning id into v_c; insert into ids values ('to_a', v_c);
  -- clients
  for k in select unnest(array['c_a','c_k','c_ab','c_new','c_newk']) loop
    insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (pg_temp.id('biza'), 'Client ' || k, '+4477009' || lpad((random()*99999)::int::text, 5, '0'), case k when 'c_a' then pg_temp.id('bra') when 'c_k' then pg_temp.id('brb') when 'c_newk' then pg_temp.id('brb') else null end) returning id into v_c;
    insert into ids values (k, v_c);
  end loop;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('c_a'), v_svc, pg_temp.id('s_a'), '2027-05-03 09:00+00', '2027-05-03 09:30+00', 30, 0, 'confirmed', 'dashboard', v_fv, 1000),
         (pg_temp.id('biza'), pg_temp.id('brb'), pg_temp.id('c_k'), v_svc, pg_temp.id('s_b'), '2027-05-03 09:00+00', '2027-05-03 09:30+00', 30, 0, 'confirmed', 'dashboard', v_fv, 1000),
         (pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('c_ab'), v_svc, pg_temp.id('s_a'), '2027-05-03 10:00+00', '2027-05-03 10:30+00', 30, 0, 'confirmed', 'dashboard', v_fv, 1000),
         (pg_temp.id('biza'), pg_temp.id('brb'), pg_temp.id('c_ab'), v_svc, pg_temp.id('s_b'), '2027-05-03 10:00+00', '2027-05-03 10:30+00', 30, 0, 'confirmed', 'dashboard', v_fv, 1000);
  insert into public.audit_logs (business_id, action) values (pg_temp.id('biza'), 'test.audit');
end $$;

-- updated-row counter
create or replace function pg_temp.upd(p_user text, p_sql text) returns text language sql as $$
  select pg_temp.as_q(p_user, 'with u as (' || p_sql || ' returning 1) select count(*)::text from u')
$$;

do $$
declare u text; v_names text;
begin
  -- ============ STAFF ============
  foreach u in array array['owner','custall'] loop
    perform pg_temp.chk(u || ' edits every staff profile (A, B, AB, none)', pg_temp.upd(u, format($q$update public.staff_profiles set job_title = 'x_%s' where business_id = %L$q$, u, pg_temp.id('biza'))), '4');
  end loop;
  perform pg_temp.chk('manager A edits ONLY staff whose branches are all A (A + the branchless one)', pg_temp.upd('mgra', format($q$update public.staff_profiles set job_title = 'm' where business_id = %L$q$, pg_temp.id('biza'))), '2');
  perform pg_temp.chk('...the ones touched are A and None, not B and not AB', (select string_agg(display_name, ',' order by display_name) from public.staff_profiles where business_id = pg_temp.id('biza') and job_title = 'm'), 'Staff A,Staff None');
  perform pg_temp.chk('manager B (Karachi) edits only B and none', pg_temp.upd('mgrk', format($q$update public.staff_profiles set job_title = 'k' where business_id = %L$q$, pg_temp.id('biza'))), '2');
  perform pg_temp.chk('custom role at ONE branch (A): same as manager A', pg_temp.upd('cust1', format($q$update public.staff_profiles set job_title = 'c1' where business_id = %L$q$, pg_temp.id('biza'))), '2');
  perform pg_temp.chk('receptionist (no staff.manage) edits none', pg_temp.upd('recep', format($q$update public.staff_profiles set job_title = 'r' where business_id = %L$q$, pg_temp.id('biza'))), '0');
  perform pg_temp.chk('staff (own scope) edits none', pg_temp.upd('staffa', format($q$update public.staff_profiles set job_title = 's' where business_id = %L$q$, pg_temp.id('biza'))), '0');
  perform pg_temp.chk('other business edits none', pg_temp.upd('ownerb', format($q$update public.staff_profiles set job_title = 'b' where business_id = %L$q$, pg_temp.id('biza'))), '0');
  perform pg_temp.chk('manager A cannot soft-delete staff of branch B or the shared one', pg_temp.upd('mgra', format($q$update public.staff_profiles set deleted_at = now() where id in (%L, %L)$q$, pg_temp.id('s_b'), pg_temp.id('s_ab'))), '0');
  perform pg_temp.chk('manager A cannot hard-delete them either', pg_temp.as_q('mgra', format($q$with d as (delete from public.staff_profiles where id in (%L, %L) returning 1) select count(*)::text from d$q$, pg_temp.id('s_b'), pg_temp.id('s_ab'))), '0');
  perform pg_temp.chk('...but may create a new profile (it works nowhere yet) and assign it to THEIR branch',
    pg_temp.try_as('mgra', format($q$insert into public.staff_profiles (business_id, display_name) values (%L, 'New by A')$q$, pg_temp.id('biza'))) || '/' ||
    pg_temp.try_as('mgra', format($q$insert into public.staff_branches (staff_id, branch_id, business_id) select id, %L, business_id from public.staff_profiles where display_name = 'New by A'$q$, pg_temp.id('bra'))), 'ok/ok');
  perform pg_temp.chk('...and then edit it (all its branches are theirs)', pg_temp.upd('mgra', $q$update public.staff_profiles set job_title = 'edited' where display_name = 'New by A'$q$), '1');
  perform pg_temp.chk('manager A cannot assign staff to branch B', pg_temp.try_as('mgra', format($q$insert into public.staff_branches (staff_id, branch_id, business_id) values (%L, %L, %L)$q$, pg_temp.id('s_a'), pg_temp.id('brb'), pg_temp.id('biza'))), '42501');
  -- time off
  perform pg_temp.chk('manager A cannot edit/delete B''s time off', pg_temp.upd('mgra', format($q$update public.staff_time_off set ends_at = ends_at + interval '1 day' where id = %L$q$, pg_temp.id('to_b'))), '0');
  perform pg_temp.chk('manager A edits A''s time off', pg_temp.upd('mgra', format($q$update public.staff_time_off set ends_at = ends_at + interval '1 day' where id = %L$q$, pg_temp.id('to_a'))), '1');
  perform pg_temp.chk('manager A cannot add time off for B''s staff', pg_temp.try_as('mgra', format($q$insert into public.staff_time_off (business_id, staff_id, starts_at, ends_at) values (%L, %L, now() + interval '20 days', now() + interval '21 days')$q$, pg_temp.id('biza'), pg_temp.id('s_b'))), '42501');
  perform pg_temp.chk('staff (own) still manages their OWN time off', pg_temp.upd('staffa', format($q$update public.staff_time_off set ends_at = ends_at + interval '1 day' where id = %L$q$, pg_temp.id('to_a'))), '1');
  perform pg_temp.chk('...and not a colleague''s', pg_temp.upd('staffa', format($q$update public.staff_time_off set ends_at = ends_at + interval '1 day' where id = %L$q$, pg_temp.id('to_b'))), '0');
  -- service assignment
  perform pg_temp.chk('manager A cannot assign a service to B''s staff', pg_temp.try_as('mgra', format($q$insert into public.service_staff (service_id, staff_id, business_id) values (%L, %L, %L)$q$, pg_temp.id('svc'), pg_temp.id('s_b'), pg_temp.id('biza'))), '42501');
  perform pg_temp.chk('...nor to the shared staff (AB)', pg_temp.try_as('mgra', format($q$insert into public.service_staff (service_id, staff_id, business_id) values (%L, %L, %L)$q$, pg_temp.id('svc'), pg_temp.id('s_ab'), pg_temp.id('biza'))), '42501');
  perform pg_temp.chk('...but to A''s staff', pg_temp.try_as('mgra', format($q$insert into public.service_staff (service_id, staff_id, business_id) values (%L, %L, %L)$q$, pg_temp.id('svc'), pg_temp.id('s_a'), pg_temp.id('biza'))), 'ok');

  -- ============ SERVICES, CATEGORIES, CUSTOM FIELDS ============
  foreach u in array array['owner','custall'] loop
    perform pg_temp.chk(u || ' edits the shared catalogue', pg_temp.upd(u, format($q$update public.services set description = 'x%s' where id = %L$q$, u, pg_temp.id('svc'))) || '/' || pg_temp.upd(u, format($q$update public.service_categories set name = 'Hair %s' where id = %L$q$, u, pg_temp.id('cat'))) || '/' || pg_temp.upd(u, format($q$update public.custom_fields set label = 'L%s' where id = %L$q$, u, pg_temp.id('cf'))), '1/1/1');
  end loop;
  foreach u in array array['mgra','mgrk','cust1','recep','staffa','ownerb'] loop
    perform pg_temp.chk(u || ' cannot edit service / category / custom field', pg_temp.upd(u, format($q$update public.services set description = 'h' where id = %L$q$, pg_temp.id('svc'))) || '/' || pg_temp.upd(u, format($q$update public.service_categories set name = 'h' where id = %L$q$, pg_temp.id('cat'))) || '/' || pg_temp.upd(u, format($q$update public.custom_fields set label = 'h' where id = %L$q$, pg_temp.id('cf'))), '0/0/0');
  end loop;
  perform pg_temp.chk('...and cannot create them', pg_temp.try_as('mgra', format($q$insert into public.services (business_id, name, duration_minutes) values (%L, 'Nope', 30)$q$, pg_temp.id('biza'))) || '/' || pg_temp.try_as('mgra', format($q$insert into public.custom_fields (business_id, label, field_type, applies_to_all_services) values (%L, 'Nope', 'short_text', true)$q$, pg_temp.id('biza'))), '42501/42501');
  perform pg_temp.chk('...nothing was changed', (select description is null or description like 'x%' from public.services where id = pg_temp.id('svc'))::text, 'true');
  -- per-branch price stays with the branch manager
  perform pg_temp.chk('manager A sets A''s price', pg_temp.upd('mgra', format($q$update public.service_branches set price_minor = 1100 where service_id = %L and branch_id = %L$q$, pg_temp.id('svc'), pg_temp.id('bra'))), '1');
  perform pg_temp.chk('manager A cannot set B''s price', pg_temp.upd('mgra', format($q$update public.service_branches set price_minor = 1 where service_id = %L and branch_id = %L$q$, pg_temp.id('svc'), pg_temp.id('brb'))), '0');
  perform pg_temp.chk('...B''s price intact', (select price_minor::text from public.service_branches where service_id = pg_temp.id('svc') and branch_id = pg_temp.id('brb')), '100000');
  perform pg_temp.chk('manager B sets B''s price', pg_temp.upd('mgrk', format($q$update public.service_branches set price_minor = 100500 where service_id = %L and branch_id = %L$q$, pg_temp.id('svc'), pg_temp.id('brb'))), '1');
end $$;

-- ============ CLIENTS ============
do $$
begin
  perform pg_temp.chk('owner sees all 5 clients', pg_temp.as_q('owner', 'select count(*)::text from public.clients'), '5');
  perform pg_temp.chk('all-scope custom role sees all 5', pg_temp.as_q('custall', 'select count(*)::text from public.clients'), '5');
  perform pg_temp.chk('manager A sees: c_a, c_ab (visit at A), and the never-visited client with no branch (c_new)', pg_temp.as_q('mgra', 'select string_agg(full_name, '','' order by full_name) from public.clients'), 'Client c_a,Client c_ab,Client c_new');
  perform pg_temp.chk('manager B sees: c_k, c_ab, c_newk (first booked at B) and c_new', pg_temp.as_q('mgrk', 'select string_agg(full_name, '','' order by full_name) from public.clients'), 'Client c_ab,Client c_k,Client c_new,Client c_newk');
  perform pg_temp.chk('receptionist A sees the same as manager A', pg_temp.as_q('recep', 'select string_agg(full_name, '','' order by full_name) from public.clients'), 'Client c_a,Client c_ab,Client c_new');
  perform pg_temp.chk('custom role at ONE branch (A) likewise', pg_temp.as_q('cust1', 'select string_agg(full_name, '','' order by full_name) from public.clients'), 'Client c_a,Client c_ab,Client c_new');
  perform pg_temp.chk('staff (own scope) sees only clients they serve (c_a, c_ab)', pg_temp.as_q('staffa', 'select string_agg(full_name, '','' order by full_name) from public.clients'), 'Client c_a,Client c_ab');
  perform pg_temp.chk('other business sees none', pg_temp.as_q('ownerb', 'select count(*)::text from public.clients'), '0');
  perform pg_temp.chk('manager A edits A''s clients and the shared one, NOT c_k / c_newk', pg_temp.upd('mgra', format($q$update public.clients set notes = 'A' where business_id = %L$q$, pg_temp.id('biza'))), '3');
  perform pg_temp.chk('...c_k untouched', (select coalesce(notes, 'null') from public.clients where id = pg_temp.id('c_k')), 'null');
  perform pg_temp.chk('manager B edits B''s clients (c_k, c_ab, c_newk, c_new)', pg_temp.upd('mgrk', format($q$update public.clients set notes = 'B' where business_id = %L$q$, pg_temp.id('biza'))), '4');
  perform pg_temp.chk('receptionist edits A''s clients only', pg_temp.upd('recep', format($q$update public.clients set notes = 'R' where business_id = %L$q$, pg_temp.id('biza'))), '3');
  perform pg_temp.chk('staff (no clients.edit) edits none', pg_temp.upd('staffa', format($q$update public.clients set notes = 'S' where business_id = %L$q$, pg_temp.id('biza'))), '0');
  perform pg_temp.chk('other business edits none', pg_temp.upd('ownerb', format($q$update public.clients set notes = 'X' where business_id = %L$q$, pg_temp.id('biza'))), '0');
  perform pg_temp.chk('creating a client is still allowed to a branch holder', pg_temp.try_as('mgra', format($q$insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (%L, 'Made by A', '+447700912345', %L)$q$, pg_temp.id('biza'), pg_temp.id('bra'))), 'ok');
  perform pg_temp.chk('...and they see it, manager B does not', pg_temp.as_q('mgra', 'select count(*)::text from public.clients where full_name = ''Made by A''') || '/' || pg_temp.as_q('mgrk', 'select count(*)::text from public.clients where full_name = ''Made by A'''), '1/0');
  perform pg_temp.chk('appointments by branch stay isolated (unchanged): manager A sees only branch A rows', pg_temp.as_q('mgra', 'select count(distinct branch_id)::text from public.appointments'), '1');
end $$;

-- ============ AUDIT LOG ============
do $$
begin
  perform pg_temp.chk('owner reads the audit log', (pg_temp.as_q('owner', 'select (count(*) > 0)::text from public.audit_logs')), 'true');
  perform pg_temp.chk('all-scope settings.business holder reads it', pg_temp.as_q('custall', 'select (count(*) > 0)::text from public.audit_logs'), 'true');
  perform pg_temp.chk('settings.business at ONE branch does NOT', pg_temp.as_q('cust1', 'select count(*)::text from public.audit_logs'), '0');
  perform pg_temp.chk('manager A, manager B, receptionist, staff: none', pg_temp.as_q('mgra', 'select count(*)::text from public.audit_logs') || pg_temp.as_q('mgrk', 'select count(*)::text from public.audit_logs') || pg_temp.as_q('recep', 'select count(*)::text from public.audit_logs') || pg_temp.as_q('staffa', 'select count(*)::text from public.audit_logs'), '0000');
  perform pg_temp.chk('other business owner sees none of A''s rows', pg_temp.as_q('ownerb', format($q$select count(*)::text from public.audit_logs where business_id = %L$q$, pg_temp.id('biza'))), '0');
  perform pg_temp.chk('anon refused', pg_temp.as_anon('select to_jsonb(count(*)) from public.audit_logs')->>'state', '42501');
end $$;

-- ============ REPORT EMAIL PAYLOAD PURGE ============
do $$
declare v_id uuid; s text; v_try text;
begin
  insert into public.message_outbox (business_id, branch_id, user_id, channel, event, idempotency_key, payload)
  values (pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('owner'), 'email', 'report_summary', 'p9b:purge:1', '{"revenue":[{"currency":"GBP","net_revenue_minor":123456}]}'::jsonb) returning id into v_id;
  perform pg_temp.chk('while open (pending) the payload is kept', (select payload::text like '%123456%' from public.message_outbox where id = v_id)::text, 'true');
  update public.message_outbox set status = 'sending' where id = v_id;
  perform pg_temp.chk('...and while sending / retry', (select payload::text like '%123456%' from public.message_outbox where id = v_id)::text, 'true');
  update public.message_outbox set status = 'retry' where id = v_id;
  perform pg_temp.chk('...retry keeps it (the next attempt needs it)', (select payload::text like '%123456%' from public.message_outbox where id = v_id)::text, 'true');
  foreach s in array array['sent','dead','skipped','cancelled'] loop
    insert into public.message_outbox (business_id, branch_id, user_id, channel, event, idempotency_key, payload)
    values (pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('owner'), 'email', 'report_summary', 'p9b:purge:' || s, '{"revenue":[{"net_revenue_minor":654321}]}'::jsonb) returning id into v_id;
    update public.message_outbox set status = s where id = v_id;
    perform pg_temp.chk('payload emptied when the row becomes ' || s, (select payload::text from public.message_outbox where id = v_id), '{}');
  end loop;
  v_try := pg_temp.try(format($q$insert into public.message_outbox (business_id, branch_id, user_id, channel, event, idempotency_key, status, payload, finished_at) values (%L, %L, %L, 'email', 'report_summary', 'p9b:purge:direct', 'sent', '{"x":1}', now())$q$, pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('owner')));
  perform pg_temp.chk('inserted straight into a final status: allowed, payload emptied', v_try || '/' || (select payload::text from public.message_outbox where idempotency_key = 'p9b:purge:direct'), 'ok/{}');
  perform pg_temp.chk('the CHECK itself holds even if the trigger were bypassed', (select count(*)::text from pg_constraint where conname = 'message_outbox_report_payload_only_while_open' and convalidated), '1');
  v_try := pg_temp.try(format($q$insert into public.message_outbox (business_id, branch_id, client_id, channel, event, idempotency_key, status, payload, finished_at) values (%L, %L, %L, 'email', 'booking_confirmed', 'p9b:purge:other', 'sent', '{"x":1}', now())$q$, pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('c_a')));
  perform pg_temp.chk('other events keep their payload (not touched)', v_try || '/' || (select payload::text from public.message_outbox where idempotency_key = 'p9b:purge:other'), 'ok/{"x": 1}');
  -- the real tick path: a queued report row loses its payload when the worker finishes it
  select id into v_id from public.message_outbox where idempotency_key = 'p9b:purge:1';
  perform public.outbox_finish(v_id, 'dead', 'test', null);
  perform pg_temp.chk('outbox_finish (dead) on a real report row empties the payload', (select payload::text from public.message_outbox where id = v_id), '{}');
end $$;


-- ============ MEMBERS: remove a member, revoke an invite ============
do $$
declare r jsonb; v_m uuid; v_inv uuid; v_n int; v_owner_a uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  v_m := pg_temp.member('biza', 'recep');
  perform pg_temp.chk('manager (no roles.manage) cannot remove a member', pg_temp.as_('mgra', format($q$select public.remove_member(%L)$q$, v_m))->>'code', 'forbidden');
  perform pg_temp.chk('receptionist/staff cannot', (pg_temp.as_('recep', format($q$select public.remove_member(%L)$q$, pg_temp.member('biza', 'staffa')))->>'code') || (pg_temp.as_('staffa', format($q$select public.remove_member(%L)$q$, v_m))->>'code'), 'forbiddenforbidden');
  perform pg_temp.chk('other business cannot', pg_temp.as_('ownerb', format($q$select public.remove_member(%L)$q$, v_m))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute', pg_temp.as_anon(format($q$select public.remove_member(%L)$q$, v_m))->>'state', '42501');
  perform pg_temp.chk('unknown member', pg_temp.as_('owner', $q$select public.remove_member(gen_random_uuid())$q$)->>'code', 'not_found');
  perform pg_temp.chk('nobody removes themselves', pg_temp.as_('owner', format($q$select public.remove_member(%L)$q$, pg_temp.member('biza', 'owner')))->>'code', 'cannot_remove_self');
  -- a delegate who may manage roles but holds less than an Owner cannot remove the Owner
  perform pg_temp.chk('custom role-manager cannot remove an Owner', pg_temp.as_('cust1', format($q$select public.remove_member(%L)$q$, pg_temp.member('biza', 'owner')))->>'code', 'forbidden');
  r := pg_temp.as_('owner', format($q$select public.remove_member(%L)$q$, v_m));
  perform pg_temp.chk('owner removes the receptionist', r->>'ok', 'true');
  perform pg_temp.chk('stored: disabled + soft-deleted, no assignments left', (select status::text || '/' || (deleted_at is not null)::text || '/' || (select count(*) from public.member_role_assignments where member_id = v_m) from public.business_members where id = v_m), 'disabled/true/0');
  perform pg_temp.chk('...they lose every permission at once', pg_temp.as_q('recep', format($q$select public.has_permission(%L, null, 'appointments.view')::text$q$, pg_temp.id('biza'))), 'false');
  perform pg_temp.chk('audit member.removed has who/what', (select (before->>'email') from public.audit_logs where action = 'member.removed' and entity_id = v_m::text), 'p9bt.recep@example.com');
  perform pg_temp.chk('removing twice -> not_found', pg_temp.as_('owner', format($q$select public.remove_member(%L)$q$, v_m))->>'code', 'not_found');
  -- invites
  perform pg_temp.chk('the owner adds someone by email', pg_temp.as_('owner', format($q$select public.add_member_by_email(%L, 'invitee@example.com', %L, %L)$q$, pg_temp.id('biza'), pg_temp.rid('staff'), pg_temp.id('bra')))->>'ok', 'true');
  select id into v_inv from public.business_members where business_id = pg_temp.id('biza') and invited_email = 'invitee@example.com';
  perform pg_temp.chk('an invite is removed with revoke_invite, not remove_member', pg_temp.as_('owner', format($q$select public.remove_member(%L)$q$, v_inv))->>'code', 'use_revoke_invite');
  perform pg_temp.chk('staff cannot revoke', pg_temp.as_('staffa', format($q$select public.revoke_invite(%L)$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot revoke', pg_temp.as_('ownerb', format($q$select public.revoke_invite(%L)$q$, v_inv))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute revoke', pg_temp.as_anon(format($q$select public.revoke_invite(%L)$q$, v_inv))->>'state', '42501');
  perform pg_temp.chk('an ACTIVE member is not an invite', pg_temp.as_('owner', format($q$select public.revoke_invite(%L)$q$, pg_temp.member('biza', 'mgra')))->>'code', 'not_found');
  r := pg_temp.as_('mgra', format($q$select public.revoke_invite(%L)$q$, v_inv));
  perform pg_temp.chk('a manager (users.invite) may revoke a Staff invite', r->>'ok', 'true');
  perform pg_temp.chk('stored: invite dead (disabled, deleted, no token hash, no assignment)', (select status::text || '/' || (deleted_at is not null)::text || '/' || (invite_token_hash is null)::text || '/' || (select count(*) from public.member_role_assignments where member_id = v_inv) from public.business_members where id = v_inv), 'disabled/true/true/0');
  perform pg_temp.chk('audit invite.revoked', pg_temp.audit_n('invite.revoked'), '1');
  perform pg_temp.chk('the same address can be invited again (the unique index is freed)', pg_temp.as_('owner', format($q$select public.add_member_by_email(%L, 'invitee@example.com', %L, %L)$q$, pg_temp.id('biza'), pg_temp.rid('staff'), pg_temp.id('bra')))->>'ok', 'true');
  -- a Manager cannot revoke an invite for a role above theirs (an Owner invite)
  perform pg_temp.as_('owner', format($q$select public.add_member_by_email(%L, 'boss@example.com', %L)$q$, pg_temp.id('biza'), pg_temp.rid('owner')));
  perform pg_temp.chk('manager cannot revoke an Owner invite', pg_temp.as_('mgra', format($q$select public.revoke_invite(%L)$q$, (select id from public.business_members where invited_email = 'boss@example.com')))->>'code', 'cannot_modify_higher_role');
end $$;

-- ============ list_roles counts only THIS business's people ============
do $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner'));
  r := pg_temp.as_('owner', format($q$select public.list_roles(%L)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('list_roles: the Owner role counts this business''s people only', (select (x->>'member_count') from jsonb_array_elements(r->'roles') x where x->>'key' = 'owner'), (select count(*)::text from public.member_role_assignments a join public.business_members m on m.id = a.member_id where a.role_id = pg_temp.rid('owner') and m.business_id = pg_temp.id('biza') and m.deleted_at is null));
  perform pg_temp.chk('...which is NOT the platform-wide count', (select (count(*) > (select count(*) from public.member_role_assignments a join public.business_members m on m.id = a.member_id where a.role_id = pg_temp.rid('owner') and m.business_id = pg_temp.id('biza')))::text from public.member_role_assignments where role_id = pg_temp.rid('owner')), 'true');
  r := pg_temp.as_('ownerb', format($q$select public.list_roles(%L)$q$, pg_temp.id('bizb')));
  perform pg_temp.chk('...and business B sees its own count (1)', (select (x->>'member_count') from jsonb_array_elements(r->'roles') x where x->>'key' = 'owner'), '1');
  perform pg_temp.chk('list_roles: a staff member is refused', pg_temp.as_('staffa', format($q$select public.list_roles(%L)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
end $$;

-- ============ a Manager at the ONLY branch of a single-branch business covers "every branch" ============
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;
do $$
declare v_svc uuid; v_cf uuid; v_st uuid;
begin
  perform pg_temp.act_as(pg_temp.id('ownerb'));
  perform pg_temp.add_member('bizb', 'mgrb', 'manager', 'branchb');
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('bizb'), 'B Cut', 30, 0) returning id into v_svc;
  insert into public.custom_fields (business_id, label, field_type, applies_to_all_services) values (pg_temp.id('bizb'), 'B field', 'short_text', true) returning id into v_cf;
  insert into public.staff_profiles (business_id, display_name, is_active) values (pg_temp.id('bizb'), 'B Staff', true) returning id into v_st;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_st, pg_temp.id('branchb'), pg_temp.id('bizb'));
  perform pg_temp.chk('single-branch business: the Manager of its only branch edits services, custom fields and staff',
    pg_temp.upd('mgrb', format($q$update public.services set description = 'm' where id = %L$q$, v_svc)) || '/' || pg_temp.upd('mgrb', format($q$update public.custom_fields set label = 'm' where id = %L$q$, v_cf)) || '/' || pg_temp.upd('mgrb', format($q$update public.staff_profiles set job_title = 'm' where id = %L$q$, v_st)), '1/1/1');
  perform pg_temp.chk('...and can create a service', pg_temp.try_as('mgrb', format($q$insert into public.services (business_id, name, duration_minutes) values (%L, 'B New', 30)$q$, pg_temp.id('bizb'))), 'ok');
  -- a SECOND branch appears: the manager no longer covers every branch
  insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix) values (pg_temp.id('bizb'), 'B Two', false, 'America/Chicago', 'USD', 'US', 'BTW');
  perform pg_temp.chk('after a second branch exists: services/custom fields refused for that manager', pg_temp.upd('mgrb', format($q$update public.services set description = 'x' where id = %L$q$, v_svc)) || '/' || pg_temp.upd('mgrb', format($q$update public.custom_fields set label = 'x' where id = %L$q$, v_cf)), '0/0');
  perform pg_temp.chk('...but the staff member of THEIR branch (only B main) is still theirs', pg_temp.upd('mgrb', format($q$update public.staff_profiles set job_title = 'y' where id = %L$q$, v_st)), '1');
end $$;

-- ============ Phase 10 prelude (a): teammates' names, own business only ============
do $$
declare r jsonb;
begin
  update public.profiles set full_name = 'Name ' || u.k from (select k, v from ids where k in ('owner','mgra','recep','ownerb','mgrb')) u where profiles.id = u.v;
  perform pg_temp.act_as(pg_temp.id('recep')); set local role authenticated;
  perform pg_temp.chk('team names: a receptionist sees every active member of THEIR business and nobody else',
    (select string_agg(full_name, ',' order by full_name) from public.list_business_member_names(pg_temp.id('biza'))),
    (select string_agg(p.full_name, ',' order by p.full_name) from public.business_members m join public.profiles p on p.id = m.user_id where m.business_id = pg_temp.id('biza') and m.status = 'active' and m.deleted_at is null));
  perform pg_temp.chk('...none of business B''s people appear', (select count(*)::text from public.list_business_member_names(pg_temp.id('biza')) where full_name in ('Name ownerb','Name mgrb')), '0');
  perform pg_temp.chk('...asking for business B returns nothing (not a member there)', (select count(*)::text from public.list_business_member_names(pg_temp.id('bizb'))), '0');
  perform pg_temp.chk('...and profiles RLS is unchanged: a teammate row is still unreadable directly', (select count(*)::text from public.profiles where id = pg_temp.id('mgra')), '0');
  reset role;
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  perform pg_temp.chk('team names: business B''s owner sees only B (2 members) and none of A''s', (select count(*)::text from public.list_business_member_names(pg_temp.id('bizb'))) || '/' || (select count(*)::text from public.list_business_member_names(pg_temp.id('biza'))), '2/0');
  reset role;
  perform pg_temp.chk('team names: anon is refused', pg_temp.as_anon(format($q$select to_jsonb(count(*)) from public.list_business_member_names(%L)$q$, pg_temp.id('biza')))->>'state', '42501');
end $$;

-- ============ Phase 10 prelude (b): a staff profile with NO branch is editable by any staff.manage holder
--               until it has a branch; after that, branch-scope rules apply ============
do $$
declare v_st uuid;
begin
  insert into public.staff_profiles (business_id, display_name, is_active) values (pg_temp.id('biza'), 'Fresh', true) returning id into v_st;
  perform pg_temp.chk('no-branch profile: manager A, manager B and the all-scope custom role can each edit it',
    pg_temp.upd('mgra', format($q$update public.staff_profiles set job_title = 'a' where id = %L$q$, v_st)) || '/' ||
    pg_temp.upd('mgrk', format($q$update public.staff_profiles set job_title = 'k' where id = %L$q$, v_st)) || '/' ||
    pg_temp.upd('custall', format($q$update public.staff_profiles set job_title = 'c' where id = %L$q$, v_st)), '1/1/1');
  perform pg_temp.chk('...a receptionist and a staff member (no staff.manage) cannot',
    pg_temp.upd('recep', format($q$update public.staff_profiles set job_title = 'r' where id = %L$q$, v_st)) || '/' || pg_temp.upd('staffa', format($q$update public.staff_profiles set job_title = 's' where id = %L$q$, v_st)), '0/0');
  perform pg_temp.chk('...and another business cannot', pg_temp.upd('ownerb', format($q$update public.staff_profiles set job_title = 'b' where id = %L$q$, v_st)), '0');
  -- manager A gives it branch A: from now on manager B (Karachi) is out
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_st, pg_temp.id('bra'), pg_temp.id('biza'));
  perform pg_temp.chk('once it has branch A: manager A still edits, manager B no longer does',
    pg_temp.upd('mgra', format($q$update public.staff_profiles set job_title = 'a2' where id = %L$q$, v_st)) || '/' || pg_temp.upd('mgrk', format($q$update public.staff_profiles set job_title = 'k2' where id = %L$q$, v_st)), '1/0');
  perform pg_temp.chk('...and the stored value is manager A''s edit, not manager B''s', (select job_title from public.staff_profiles where id = v_st), 'a2');
  -- shared with branch B: manager A alone no longer covers every branch of the profile
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_st, pg_temp.id('brb'), pg_temp.id('biza'));
  perform pg_temp.chk('once it also has branch B: neither single-branch manager edits it, the all-scope custom role does',
    pg_temp.upd('mgra', format($q$update public.staff_profiles set job_title = 'a3' where id = %L$q$, v_st)) || '/' || pg_temp.upd('mgrk', format($q$update public.staff_profiles set job_title = 'k3' where id = %L$q$, v_st)) || '/' || pg_temp.upd('custall', format($q$update public.staff_profiles set job_title = 'c3' where id = %L$q$, v_st)), '0/0/1');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
