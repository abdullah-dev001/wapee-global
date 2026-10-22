-- Phase 10A: add-ons "Packages & Sessions" and "Inventory" (schema, RPCs, invoice integration).
--
--   supabase db query --linked -f supabase/tests/22_packages_inventory.sql
--
-- Plain SQL, own fixtures, rolled back. Proves: RLS per role, every failure path leaves the
-- original data exactly as it was, stored values (not just return codes), expiry and
-- 10-minute-undo boundaries (clock-injected `_at` functions), add-on off/on, plan gating,
-- immutability, credit-note restore rules, business delete. Real parallel sessions:
-- 23_addons_concurrency.sh.
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
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', case when p_aal2 then 'aal2' else 'aal1' end,
      'amr', case when p_aal2 then json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)) else '[]'::json end)::text, true);
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
  select count(*)::text from public.audit_logs where action = p_action and business_id in (pg_temp.id('biza'), pg_temp.id('bizb'))
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


create or replace function pg_temp.int_as(p_user text, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id(p_user));
  execute p_sql into r;
  return r;
end $$;
-- rows visible to a user: count of a select
create or replace function pg_temp.vis(p_user text, p_sql text) returns text language sql as $$
  select pg_temp.as_q(p_user, 'select count(*)::text from (' || p_sql || ') x')
$$;
create or replace function pg_temp.inv_state(p_biz text) returns text language sql as $$
  select coalesce((select string_agg(b.invoice_next_no::text || '/' || b.credit_note_next_no::text, ',' order by b.id) from public.branches b where b.business_id = pg_temp.id(p_biz)), '')
$$;
create or replace function pg_temp.stock(p_k text) returns text language sql as $$
  select stock_qty::text from public.products where id = pg_temp.id(p_k)
$$;
create or replace function pg_temp.draft(p_user text, p_client text, p_items text) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := pg_temp.as_(p_user, format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), case when p_client is null then null else pg_temp.id(p_client) end, p_items));
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'draft failed: %', r; end if;
  return (r->>'invoice_id')::uuid;
end $$;
create or replace function pg_temp.issue(p_user text, p_inv uuid) returns jsonb language sql as $$
  select pg_temp.as_(p_user, format($q$select public.issue_invoice(%L)$q$, p_inv))
$$;
create or replace function pg_temp.appt(p_key text, p_client text, p_service text, p_staff text, p_status text, p_hour int) returns void language plpgsql as $$
declare v_fv uuid; v_id uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, cancelled_at)
  values (pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id(p_client), pg_temp.id(p_service), pg_temp.id(p_staff),
          timestamptz '2027-05-03 06:00+00' + make_interval(hours => p_hour), timestamptz '2027-05-03 06:30+00' + make_interval(hours => p_hour),
          30, 0, p_status::public.appointment_status, 'dashboard', v_fv, 1000, case when p_status = 'cancelled' then now() end) returning id into v_id;
  insert into ids values (p_key, v_id);
end $$;

-- ===========================================================================
-- Fixtures
-- ===========================================================================
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('mgra'),('recep'),('staffa'),('staffb'),('ownerb'),('stranger')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p10t.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P10 Alpha','p10-alpha','GB','GBP','Europe/London','en',null,'Alpha');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P10 Beta','p10-beta','US','USD','America/New_York','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
end $$;
insert into ids select 'bra', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;
insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix) values (pg_temp.id('biza'), 'Bravo', false, 'Asia/Karachi', 'PKR', 'PK', 'BRV');
insert into ids select 'brb', id from public.branches where business_id = pg_temp.id('biza') and name = 'Bravo';

select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('biza', 'mgra', 'manager', 'bra');
select pg_temp.add_member('biza', 'recep', 'receptionist', 'bra');
select pg_temp.add_member('biza', 'staffa', 'staff', 'bra');
select pg_temp.add_member('biza', 'staffb', 'staff', 'bra');
do $$
declare v_c uuid; v_svc uuid; k text;
begin
  insert into public.staff_profiles (business_id, display_name, is_active, member_id) values (pg_temp.id('biza'), 'Staff A', true, pg_temp.member('biza', 'staffa')) returning id into v_c; insert into ids values ('s_a', v_c);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_c, pg_temp.id('bra'), pg_temp.id('biza'));
  insert into public.staff_profiles (business_id, display_name, is_active, member_id) values (pg_temp.id('biza'), 'Staff B', true, pg_temp.member('biza', 'staffb')) returning id into v_c; insert into ids values ('s_b', v_c);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_c, pg_temp.id('bra'), pg_temp.id('biza'));
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('biza'), 'Massage', 30, 0) returning id into v_svc; insert into ids values ('svc', v_svc);
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('biza'), 'Facial', 30, 0) returning id into v_svc; insert into ids values ('svc2', v_svc);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) select id, pg_temp.id('bra'), pg_temp.id('biza'), 1000, true from public.services where business_id = pg_temp.id('biza');
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('bizb'), 'B Cut', 30, 0) returning id into v_svc; insert into ids values ('svcb', v_svc);
  for k in select unnest(array['c1','c2','c3']) loop
    insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (pg_temp.id('biza'), 'Client ' || k, '+4477001' || lpad((random()*99999)::int::text, 5, '0'), pg_temp.id('bra')) returning id into v_c;
    insert into ids values (k, v_c);
  end loop;
end $$;
-- appointments: c1 with Staff A (own) and Staff B, c2 with Staff A, c3 only with Staff B
select pg_temp.appt('ap1', 'c1', 'svc', 's_a', 'confirmed', 1);
select pg_temp.appt('ap2', 'c1', 'svc', 's_b', 'confirmed', 1);
select pg_temp.appt('ap3', 'c1', 'svc2', 's_a', 'confirmed', 2);
select pg_temp.appt('ap4', 'c2', 'svc', 's_a', 'confirmed', 3);
select pg_temp.appt('ap5', 'c1', 'svc', 's_a', 'cancelled', 4);
select pg_temp.appt('ap6', 'c1', 'svc', 's_b', 'completed', 2);
select pg_temp.appt('ap7', 'c1', 'svc', 's_a', 'confirmed', 5);
select pg_temp.appt('ap8', 'c1', 'svc', 's_b', 'confirmed', 3);
select pg_temp.appt('ap9', 'c1', 'svc', 's_a', 'confirmed', 6);
select pg_temp.appt('ap10', 'c1', 'svc', 's_b', 'confirmed', 4);
select pg_temp.appt('ap11', 'c3', 'svc', 's_b', 'confirmed', 5);
select pg_temp.appt('ap12', 'c2', 'svc', 's_b', 'confirmed', 6);
select pg_temp.appt('ap13', 'c2', 'svc', 's_a', 'confirmed', 7);
select pg_temp.appt('ap14', 'c1', 'svc', 's_a', 'confirmed', 8);

-- ===========================================================================
-- 1. Permissions seed
-- ===========================================================================
select pg_temp.chk('seed: Staff holds deduct_session at OWN scope only',
  (select string_agg(permission || ':' || scope, ',' order by permission) from public.role_permissions where role_id = pg_temp.rid('staff') and permission like 'packages.%' or role_id = pg_temp.rid('staff') and permission like 'inventory.%'), 'packages.deduct_session:own');
select pg_temp.chk('seed: Receptionist sells + deducts but cannot reverse',
  (select string_agg(permission, ',' order by permission) from public.role_permissions where role_id = pg_temp.rid('receptionist') and (permission like 'packages.%' or permission like 'inventory.%')), 'inventory.view,packages.deduct_session,packages.sell');
select pg_temp.chk('seed: Manager holds all five at branch scope',
  (select string_agg(permission || ':' || scope, ',' order by permission) from public.role_permissions where role_id = pg_temp.rid('manager') and (permission like 'packages.%' or permission like 'inventory.%')),
  'inventory.adjust:branch,inventory.view:branch,packages.deduct_session:branch,packages.reverse_session:branch,packages.sell:branch');

-- ===========================================================================
-- 2. Package definitions
-- ===========================================================================
create or replace function pg_temp.savepkg(p_user text, p_args text) returns jsonb language sql as $$
  select pg_temp.as_(p_user, 'select public.save_package(' || p_args || ')')
$$;
do $$
declare r jsonb; v_args text;
begin
  v_args := format($a$%L, null, 'Massage 3+1', 'desc', 3, 1, 5000, 30, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svc'));
  perform pg_temp.chk('save_package: a receptionist (no services.manage) is refused', pg_temp.savepkg('recep', v_args)->>'code', 'forbidden');
  perform pg_temp.chk('...staff refused', pg_temp.savepkg('staffa', v_args)->>'code', 'forbidden');
  perform pg_temp.chk('...another business refused', pg_temp.savepkg('ownerb', v_args)->>'code', 'forbidden');
  perform pg_temp.chk('...a stranger refused', pg_temp.savepkg('stranger', v_args)->>'code', 'forbidden');
  perform pg_temp.chk('...anon refused (no EXECUTE)', pg_temp.as_anon(format($q$select public.save_package(%L, null, 'x', null, 1, 0, 1, null, array[%L]::uuid[], true)$q$, pg_temp.id('bra'), pg_temp.id('svc')))->>'state', '42501');
  perform pg_temp.chk('...refusals stored nothing', (select count(*)::text from public.packages), '0');
  perform pg_temp.chk('invalid name', pg_temp.savepkg('mgra', format($a$%L, null, '  ', null, 3, 0, 100, null, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svc')))->>'code', 'invalid_name');
  perform pg_temp.chk('invalid sessions (0)', pg_temp.savepkg('mgra', format($a$%L, null, 'X', null, 0, 0, 100, null, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svc')))->>'code', 'invalid_sessions');
  perform pg_temp.chk('invalid bonus (-1)', pg_temp.savepkg('mgra', format($a$%L, null, 'X', null, 3, -1, 100, null, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svc')))->>'code', 'invalid_bonus');
  perform pg_temp.chk('invalid price (negative)', pg_temp.savepkg('mgra', format($a$%L, null, 'X', null, 3, 0, -5, null, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svc')))->>'code', 'invalid_price');
  perform pg_temp.chk('invalid expiry (0 days)', pg_temp.savepkg('mgra', format($a$%L, null, 'X', null, 3, 0, 100, 0, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svc')))->>'code', 'invalid_expiry');
  perform pg_temp.chk('no services', pg_temp.savepkg('mgra', format($a$%L, null, 'X', null, 3, 0, 100, null, array[]::uuid[], true$a$, pg_temp.id('bra')))->>'code', 'services_required');
  perform pg_temp.chk('another business''s service', pg_temp.savepkg('mgra', format($a$%L, null, 'X', null, 3, 0, 100, null, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svcb')))->>'code', 'unknown_service');
  perform pg_temp.chk('...none of the invalid calls stored a package', (select count(*)::text from public.packages), '0');
  r := pg_temp.savepkg('mgra', v_args);
  perform pg_temp.chk('manager (services.manage at the branch) creates a package', r->>'ok', 'true');
  insert into ids values ('p1', (r->>'package_id')::uuid);
  perform pg_temp.chk('stored: sessions/bonus/price/currency (branch currency)/expiry/services', (select concat_ws('|', sessions, bonus_sessions, price_minor, currency, expiry_days, (select count(*) from public.package_services s where s.package_id = p.id)) from public.packages p where p.id = pg_temp.id('p1')), '3|1|5000|GBP|30|1');
  perform pg_temp.chk('duplicate name in the branch refused', pg_temp.savepkg('mgra', v_args)->>'code', 'duplicate_name');
  perform pg_temp.chk('manager A cannot create in branch B (another branch)', pg_temp.savepkg('mgra', format($a$%L, null, 'Other', null, 3, 0, 100, null, array[%L]::uuid[], true$a$, pg_temp.id('brb'), pg_temp.id('svc')))->>'code', 'forbidden');
  perform pg_temp.chk('audit: package.created', pg_temp.audit_n('package.created'), '1');
  r := pg_temp.savepkg('owner', format($a$null, %L, 'Massage 3+1', 'desc', 3, 1, 5500, 30, array[%L, %L]::uuid[], true$a$, pg_temp.id('p1'), pg_temp.id('svc'), pg_temp.id('svc2')));
  perform pg_temp.chk('update: price + a second service', (r->>'ok') || '/' || (select price_minor::text || '/' || (select count(*) from public.package_services s where s.package_id = p.id) from public.packages p where p.id = pg_temp.id('p1')), 'true/5500/2');
  perform pg_temp.savepkg('owner', format($a$null, %L, 'Massage 3+1', 'desc', 3, 1, 5000, 30, array[%L]::uuid[], true$a$, pg_temp.id('p1'), pg_temp.id('svc')));
  perform pg_temp.chk('a refused update leaves the package as it was', pg_temp.savepkg('recep', format($a$null, %L, 'Hacked', null, 1, 0, 1, null, array[%L]::uuid[], true$a$, pg_temp.id('p1'), pg_temp.id('svc')))->>'code', 'forbidden');
  perform pg_temp.chk('...stored values unchanged', (select concat_ws('|', name, sessions, price_minor) from public.packages where id = pg_temp.id('p1')), 'Massage 3+1|3|5000');
end $$;

-- ===========================================================================
-- 3. Selling a package on an invoice (sold AT ISSUE)
-- ===========================================================================
do $$
declare v_inv uuid; r jsonb; v_state text; v_inv2 uuid;
begin
  -- a draft with a package line but NO client cannot be issued, and nothing changes
  v_inv := pg_temp.draft('recep', null, format($i$[{"package_id": "%s"}]$i$, pg_temp.id('p1')));
  perform pg_temp.chk('draft: package line prefilled from the definition (name, price)', (select description || '/' || unit_price_minor || '/' || quantity from public.invoice_items where invoice_id = v_inv), 'Massage 3+1/5000/1');
  perform pg_temp.chk('print data returns the package link of a draft line (so editing keeps it)', pg_temp.as_('recep', format($q$select public.get_invoice_print_data(%L)$q$, v_inv))->'items'->0->>'package_id', pg_temp.id('p1')::text);
  v_state := pg_temp.inv_state('biza');
  perform pg_temp.chk('issue without a client: client_required_for_package', pg_temp.issue('recep', v_inv)->>'code', 'client_required_for_package');
  perform pg_temp.chk('...invoice still a draft, counter unchanged, no client_package', (select status::text from public.invoices where id = v_inv) || '/' || (pg_temp.inv_state('biza') = v_state)::text || '/' || (select count(*)::text from public.client_packages), 'draft/true/0');
  r := pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, null, %L)$q$, v_inv, pg_temp.id('c1')));
  perform pg_temp.chk('draft: a package line needs quantity 1', pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb)$q$, v_inv, format($i$[{"package_id": "%s", "quantity": 2}]$i$, pg_temp.id('p1'))))->>'code', 'package_quantity');
  perform pg_temp.chk('draft: a package and a service on one line is invalid', pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb)$q$, v_inv, format($i$[{"package_id": "%s", "service_id": "%s"}]$i$, pg_temp.id('p1'), pg_temp.id('svc'))))->>'code', 'invalid_items');
  perform pg_temp.chk('draft: an unknown package', pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb)$q$, v_inv, format($i$[{"package_id": "%s"}]$i$, gen_random_uuid())))->>'code', 'unknown_package');
  perform pg_temp.chk('draft: a staff member cannot add a package (no packages.sell / no invoices.create)', pg_temp.as_('staffa', format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), pg_temp.id('c1'), format($i$[{"package_id": "%s"}]$i$, pg_temp.id('p1'))))->>'code', 'forbidden');
  r := pg_temp.issue('recep', v_inv);
  perform pg_temp.chk('issue with a client: ok', r->>'ok', 'true');
  insert into ids select 'cp1', id from public.client_packages where invoice_id = v_inv;
  insert into ids values ('inv_pkg1', v_inv);
  perform pg_temp.chk('stored client_package snapshot: client, name, sessions, bonus, price, currency, branch',
    (select concat_ws('|', client_id = pg_temp.id('c1'), name, sessions_purchased, sessions_bonus, price_minor, currency, branch_id = pg_temp.id('bra'), invoice_item_id is not null) from public.client_packages where id = pg_temp.id('cp1')), 't|Massage 3+1|3|1|5000|GBP|t|t');
  perform pg_temp.chk('stored expiry = local midnight AFTER sold day + 30 (London)',
    (select (expires_at = (((sold_at at time zone 'Europe/London')::date + 31)::timestamp at time zone 'Europe/London'))::text from public.client_packages where id = pg_temp.id('cp1')), 'true');
  perform pg_temp.chk('services copied to the snapshot', (select count(*)::text from public.client_package_services where client_package_id = pg_temp.id('cp1')), '1');
  perform pg_temp.chk('audit: package.sold', pg_temp.audit_n('package.sold'), '1');
  -- later edits to the definition never touch what was sold
  perform pg_temp.savepkg('owner', format($a$null, %L, 'Massage 3+1', 'desc', 9, 9, 99999, 5, array[%L]::uuid[], true$a$, pg_temp.id('p1'), pg_temp.id('svc')));
  perform pg_temp.chk('editing the definition leaves the sold package alone', (select concat_ws('|', sessions_purchased, sessions_bonus, price_minor) from public.client_packages where id = pg_temp.id('cp1')), '3|1|5000');
  perform pg_temp.savepkg('owner', format($a$null, %L, 'Massage 3+1', 'desc', 3, 1, 5000, 30, array[%L]::uuid[], true$a$, pg_temp.id('p1'), pg_temp.id('svc')));
  -- a package with a discount stores the NET price paid
  v_inv2 := pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), pg_temp.id('c2'), format($i$[{"package_id": "%s", "discount_minor": 1000, "discount_reason": "loyal client"}]$i$, pg_temp.id('p1'))))->>'invoice_id';
  perform pg_temp.chk('issue a discounted package line: ok', pg_temp.issue('owner', v_inv2::uuid)->>'ok', 'true');
  perform pg_temp.chk('...stored price is the line NET (5000 - 1000)', (select price_minor::text from public.client_packages where invoice_id = v_inv2::uuid), '4000');
  insert into ids select 'cp_c2', id from public.client_packages where invoice_id = v_inv2::uuid;
  insert into ids values ('inv_pkg2', v_inv2::uuid);
end $$;

-- ===========================================================================
-- 4. Deduct a session
-- ===========================================================================
do $$
declare r jsonb;
begin
  perform pg_temp.chk('deduct: Staff A on THEIR OWN appointment (own scope)', pg_temp.as_('staffa', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap1'), pg_temp.id('cp1')))->>'remaining', '3');
  insert into ids select 'u1', id from public.session_usages where appointment_id = pg_temp.id('ap1') and kind = 'deduct';
  perform pg_temp.chk('stored usage: kind, package, appointment, service, creator, branch', (select concat_ws('|', kind, client_package_id = pg_temp.id('cp1'), appointment_id = pg_temp.id('ap1'), service_id = pg_temp.id('svc'), created_by = pg_temp.id('staffa'), branch_id = pg_temp.id('bra')) from public.session_usages where id = pg_temp.id('u1')), 'deduct|t|t|t|t|t');
  perform pg_temp.chk('...used = 1, remaining = 3', public.client_package_used(pg_temp.id('cp1'))::text, '1');
  perform pg_temp.chk('deduct: Staff A on a colleague''s appointment is refused (own scope)', pg_temp.as_('staffa', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap2'), pg_temp.id('cp1')))->>'code', 'forbidden');
  perform pg_temp.chk('deduct: a second deduction for the SAME appointment', pg_temp.as_('staffa', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap1'), pg_temp.id('cp1')))->>'code', 'already_deducted');
  perform pg_temp.chk('deduct: a service the package does not cover', pg_temp.as_('staffa', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap3'), pg_temp.id('cp1')))->>'code', 'service_not_covered');
  perform pg_temp.chk('deduct: another client''s appointment', pg_temp.as_('staffa', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap4'), pg_temp.id('cp1')))->>'code', 'client_mismatch');
  perform pg_temp.chk('deduct: a cancelled appointment', pg_temp.as_('recep', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap5'), pg_temp.id('cp1')))->>'code', 'appointment_not_eligible');
  perform pg_temp.chk('deduct: a completed appointment is fine (receptionist)', pg_temp.as_('recep', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap6'), pg_temp.id('cp1')))->>'ok', 'true');
  perform pg_temp.chk('deduct: another business refused', pg_temp.as_('ownerb', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap7'), pg_temp.id('cp1')))->>'code', 'forbidden');
  perform pg_temp.chk('deduct: a stranger refused', pg_temp.as_('stranger', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap7'), pg_temp.id('cp1')))->>'code', 'forbidden');
  perform pg_temp.chk('deduct: anon has no EXECUTE', pg_temp.as_anon(format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap7'), pg_temp.id('cp1')))->>'state', '42501');
  perform pg_temp.chk('deduct: a nonexistent appointment', pg_temp.as_('recep', format($q$select public.deduct_session(%L, %L)$q$, gen_random_uuid(), pg_temp.id('cp1')))->>'code', 'not_found');
  perform pg_temp.chk('...every refusal wrote nothing: 2 deductions stored', (select count(*)::text from public.session_usages where client_package_id = pg_temp.id('cp1')), '2');
  -- spend the bonus: 3 purchased + 1 bonus = 4 in total
  perform pg_temp.chk('3rd deduction ok', pg_temp.as_('recep', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap7'), pg_temp.id('cp1')))->>'remaining', '1');
  perform pg_temp.chk('4th deduction ok (it is the BONUS session)', pg_temp.as_('recep', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap8'), pg_temp.id('cp1')))->>'remaining', '0');
  perform pg_temp.chk('5th deduction: cannot exceed purchased + bonus', pg_temp.as_('recep', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap9'), pg_temp.id('cp1')))->>'code', 'no_sessions_left');
  perform pg_temp.chk('...stored: exactly 4 deductions, used 4', (select count(*)::text from public.session_usages where client_package_id = pg_temp.id('cp1') and kind = 'deduct') || '/' || public.client_package_used(pg_temp.id('cp1')), '4/4');
  perform pg_temp.chk('DB backstop: a raw insert past the balance is refused (P0001 no_sessions_left)', pg_temp.try(format($q$insert into public.session_usages (business_id, branch_id, client_package_id, kind, appointment_id, service_id) values (%L, %L, %L, 'deduct', %L, %L)$q$, pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('cp1'), pg_temp.id('ap9'), pg_temp.id('svc'))), 'P0001');
end $$;

-- ===========================================================================
-- 5. Reverse / undo (boundaries use the clock-injected internal function)
-- ===========================================================================
do $$
declare r jsonb; v_t timestamptz := '2027-06-01 12:00:00+00'; v_u uuid; v_u2 uuid; v_before text;
begin
  -- recep deducts u_r at T
  r := pg_temp.int_as('recep', format($q$select public.deduct_session_at(%L, %L, %L)$q$, pg_temp.id('ap9'), pg_temp.id('cp_c2'), v_t));
  perform pg_temp.chk('(setup) other-client package refused for ap9 (client_mismatch)', r->>'code', 'client_mismatch');
  -- reverse the stranger/permission shapes using u1 (created by staffa at real now())
  perform pg_temp.chk('reverse: another business refused', pg_temp.as_('ownerb', format($q$select public.reverse_session(%L, 'no way')$q$, pg_temp.id('u1')))->>'code', 'forbidden');
  perform pg_temp.chk('reverse: a colleague with no reverse permission (staff B) refused', pg_temp.as_('staffb', format($q$select public.reverse_session(%L, 'no way')$q$, pg_temp.id('u1')))->>'code', 'forbidden');
  perform pg_temp.chk('reverse: a receptionist who is NOT the creator refused', pg_temp.as_('recep', format($q$select public.reverse_session(%L, 'no way')$q$, pg_temp.id('u1')))->>'code', 'forbidden');
  perform pg_temp.chk('reverse: anon has no EXECUTE', pg_temp.as_anon(format($q$select public.reverse_session(%L, 'x')$q$, pg_temp.id('u1')))->>'state', '42501');
  v_before := (select count(*)::text from public.session_usages);
  perform pg_temp.chk('...refused reversals wrote nothing', v_before, (select count(*)::text from public.session_usages));
  -- a fresh package for boundary tests: sell P2 (2 sessions, no expiry) to c1 via the owner
  perform pg_temp.savepkg('owner', format($a$%L, null, 'Facial 5', null, 5, 0, 7000, null, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svc')));
  insert into ids select 'p2', id from public.packages where name = 'Facial 5';
  perform pg_temp.issue('owner', pg_temp.draft('owner', 'c1', format($i$[{"package_id": "%s"}]$i$, pg_temp.id('p2'))));
  insert into ids select 'cp2', id from public.client_packages where package_id = pg_temp.id('p2');
  -- recep deducts at T on ap10
  r := pg_temp.int_as('recep', format($q$select public.deduct_session_at(%L, %L, %L)$q$, pg_temp.id('ap10'), pg_temp.id('cp2'), v_t));
  perform pg_temp.chk('(setup) deduct at T', r->>'ok', 'true');
  v_u := (r->>'usage_id')::uuid; insert into ids values ('u_r', v_u);
  perform pg_temp.chk('undo: the creator at T + 10:00.001 is too late (undo_window_passed)', pg_temp.int_as('recep', format($q$select public.reverse_session_at(%L, null, %L)$q$, v_u, v_t + interval '10 minutes 1 millisecond'))->>'code', 'undo_window_passed');
  perform pg_temp.chk('undo: a NON-creator without the permission, even in the window', pg_temp.int_as('staffb', format($q$select public.reverse_session_at(%L, null, %L)$q$, v_u, v_t + interval '1 minute'))->>'code', 'forbidden');
  perform pg_temp.chk('undo: a clock BEFORE the deduction is not "within 10 minutes"', pg_temp.int_as('recep', format($q$select public.reverse_session_at(%L, null, %L)$q$, v_u, v_t - interval '1 second'))->>'code', 'undo_window_passed');
  perform pg_temp.chk('...nothing reversed yet', (select count(*)::text from public.session_usages where reverses_usage_id = v_u), '0');
  r := pg_temp.int_as('recep', format($q$select public.reverse_session_at(%L, null, %L)$q$, v_u, v_t + interval '10 minutes'));
  perform pg_temp.chk('undo: the creator at EXACTLY 10:00 is allowed (no reason needed)', r->>'ok', 'true');
  perform pg_temp.chk('stored reversal: NEW row, kind, reverses, creator, created_at = the clock', (select concat_ws('|', kind, reverses_usage_id = v_u, created_by = pg_temp.id('recep'), created_at = v_t + interval '10 minutes', appointment_id = pg_temp.id('ap10')) from public.session_usages where id = (r->>'reversal_id')::uuid), 'reversal|t|t|t|t');
  perform pg_temp.chk('...the original deduction row still exists, unchanged', (select concat_ws('|', kind, created_at = v_t) from public.session_usages where id = v_u), 'deduct|t');
  perform pg_temp.chk('...the session is back: used = 0', public.client_package_used(pg_temp.id('cp2'))::text, '0');
  perform pg_temp.chk('reverse twice: already_reversed', pg_temp.int_as('owner', format($q$select public.reverse_session_at(%L, 'second try', %L)$q$, v_u, v_t + interval '1 hour'))->>'code', 'already_reversed');
  perform pg_temp.chk('reverse a REVERSAL row: not_a_usage', pg_temp.int_as('owner', format($q$select public.reverse_session_at(%L, 'oops', %L)$q$, (r->>'reversal_id')::uuid, v_t + interval '1 hour'))->>'code', 'not_a_usage');
  -- the appointment can be deducted again after the reversal
  r := pg_temp.int_as('recep', format($q$select public.deduct_session_at(%L, %L, %L)$q$, pg_temp.id('ap10'), pg_temp.id('cp2'), v_t + interval '11 minutes'));
  perform pg_temp.chk('after a reversal the appointment can be deducted again (new row)', r->>'ok', 'true');
  v_u2 := (r->>'usage_id')::uuid;
  perform pg_temp.chk('manager (reverse_session) reverses any time, reason required', pg_temp.int_as('mgra', format($q$select public.reverse_session_at(%L, null, %L)$q$, v_u2, v_t + interval '3 days'))->>'code', 'reason_required');
  perform pg_temp.chk('...a 2-char reason is not a reason', pg_temp.int_as('mgra', format($q$select public.reverse_session_at(%L, 'ok', %L)$q$, v_u2, v_t + interval '3 days'))->>'code', 'reason_required');
  perform pg_temp.chk('...with a reason it works, days later', pg_temp.int_as('mgra', format($q$select public.reverse_session_at(%L, 'Client did not attend', %L)$q$, v_u2, v_t + interval '3 days'))->>'ok', 'true');
  perform pg_temp.chk('...reason stored', (select reason from public.session_usages where reverses_usage_id = v_u2), 'Client did not attend');
  perform pg_temp.chk('owner reverses any time too (u1 via the real clock)', pg_temp.as_('owner', format($q$select public.reverse_session(%L, 'Entered by mistake')$q$, pg_temp.id('u1')))->>'ok', 'true');
  perform pg_temp.chk('audit: deducted x6 so far, reversed x3', pg_temp.audit_n('package.session_deducted') || '/' || pg_temp.audit_n('package.session_reversed'), '6/3');
  -- immutability
  perform pg_temp.chk('session_usages: UPDATE refused even for postgres', pg_temp.try(format($q$update public.session_usages set reason = 'x' where id = %L$q$, v_u)), '23514');
  perform pg_temp.chk('session_usages: DELETE refused even for postgres', pg_temp.try(format($q$delete from public.session_usages where id = %L$q$, v_u)), '23514');
  perform pg_temp.chk('client_packages: UPDATE refused', pg_temp.try(format($q$update public.client_packages set sessions_bonus = 99 where id = %L$q$, pg_temp.id('cp1'))), '23514');
  perform pg_temp.chk('client_packages: DELETE refused', pg_temp.try(format($q$delete from public.client_packages where id = %L$q$, pg_temp.id('cp1'))), '23514');
  perform pg_temp.chk('authenticated cannot write the tables directly (no grant)', pg_temp.try_as('owner', format($q$insert into public.session_usages (business_id, branch_id, client_package_id, kind, appointment_id) values (%L, %L, %L, 'deduct', %L)$q$, pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('cp2'), pg_temp.id('ap1'))), '42501');
end $$;

-- ===========================================================================
-- 6. Expiry boundary
-- ===========================================================================
do $$
declare r jsonb; v_exp timestamptz;
begin
  select expires_at into v_exp from public.client_packages where id = pg_temp.id('cp_c2');
  perform pg_temp.chk('expiry is stored (30 days from the sold day)', (v_exp is not null)::text, 'true');
  perform pg_temp.chk('deduct 1 ms BEFORE expiry works', pg_temp.int_as('recep', format($q$select public.deduct_session_at(%L, %L, %L)$q$, pg_temp.id('ap12'), pg_temp.id('cp_c2'), v_exp - interval '1 millisecond'))->>'ok', 'true');
  perform pg_temp.chk('deduct AT the expiry instant is refused', pg_temp.int_as('recep', format($q$select public.deduct_session_at(%L, %L, %L)$q$, pg_temp.id('ap13'), pg_temp.id('cp_c2'), v_exp))->>'code', 'expired');
  perform pg_temp.chk('deduct after expiry is refused', pg_temp.int_as('recep', format($q$select public.deduct_session_at(%L, %L, %L)$q$, pg_temp.id('ap13'), pg_temp.id('cp_c2'), v_exp + interval '5 days'))->>'code', 'expired');
  perform pg_temp.chk('...the refused calls stored nothing (1 usage on that package)', (select count(*)::text from public.session_usages where client_package_id = pg_temp.id('cp_c2')), '1');
  perform pg_temp.chk('a reversal AFTER expiry still works (it only returns a session)', pg_temp.int_as('owner', format($q$select public.reverse_session_at(%L, 'late fix', %L)$q$, (select id from public.session_usages where client_package_id = pg_temp.id('cp_c2') and kind = 'deduct'), v_exp + interval '5 days'))->>'ok', 'true');
  r := pg_temp.as_('recep', format($q$select to_jsonb(t) from public.list_client_packages(%L) t where t.id = %L$q$, pg_temp.id('c2'), pg_temp.id('cp_c2')));
  perform pg_temp.chk('list_client_packages: remaining 4 of 4, not cancelled', (r->>'remaining') || '/' || (r->>'is_cancelled'), '4/false');
end $$;

-- ===========================================================================
-- 7. Inventory
-- ===========================================================================
create or replace function pg_temp.saveprod(p_user text, p_args text) returns jsonb language sql as $$
  select pg_temp.as_(p_user, 'select public.save_product(' || p_args || ')')
$$;
do $$
declare r jsonb;
begin
  perform pg_temp.chk('save_product: receptionist (inventory.view only) refused', pg_temp.saveprod('recep', format($a$%L, null, 'Shampoo', 'SH-1', 'bottle', 1500, 5, true, 10$a$, pg_temp.id('bra')))->>'code', 'forbidden');
  perform pg_temp.chk('...staff refused', pg_temp.saveprod('staffa', format($a$%L, null, 'Shampoo', 'SH-1', 'bottle', 1500, 5, true, 10$a$, pg_temp.id('bra')))->>'code', 'forbidden');
  perform pg_temp.chk('...another business refused', pg_temp.saveprod('ownerb', format($a$%L, null, 'Shampoo', 'SH-1', 'bottle', 1500, 5, true, 10$a$, pg_temp.id('bra')))->>'code', 'forbidden');
  perform pg_temp.chk('invalid price', pg_temp.saveprod('mgra', format($a$%L, null, 'Shampoo', 'SH-1', 'bottle', -1, 5, true, 10$a$, pg_temp.id('bra')))->>'code', 'invalid_price');
  perform pg_temp.chk('invalid threshold', pg_temp.saveprod('mgra', format($a$%L, null, 'Shampoo', 'SH-1', 'bottle', 1, -5, true, 10$a$, pg_temp.id('bra')))->>'code', 'invalid_threshold');
  perform pg_temp.chk('invalid opening stock', pg_temp.saveprod('mgra', format($a$%L, null, 'Shampoo', 'SH-1', 'bottle', 1, 5, true, -3$a$, pg_temp.id('bra')))->>'code', 'invalid_quantity');
  perform pg_temp.chk('...nothing stored by refused calls', (select count(*)::text from public.products) || '/' || (select count(*)::text from public.stock_movements), '0/0');
  r := pg_temp.saveprod('mgra', format($a$%L, null, 'Shampoo', 'SH-1', 'bottle', 1500, 5, true, 10$a$, pg_temp.id('bra')));
  perform pg_temp.chk('manager creates a product with opening stock 10', r->>'ok', 'true');
  insert into ids values ('pr1', (r->>'product_id')::uuid);
  perform pg_temp.chk('stored product: unit, price, currency (branch), threshold, stock', (select concat_ws('|', unit, price_minor, currency, low_stock_threshold, stock_qty, is_active) from public.products where id = pg_temp.id('pr1')), 'bottle|1500|GBP|5|10|t');
  perform pg_temp.chk('stored opening movement: adjustment +10, stock_after 10, reason', (select concat_ws('|', kind, quantity, stock_after, reason) from public.stock_movements where product_id = pg_temp.id('pr1')), 'adjustment|10|10|Opening stock');
  perform pg_temp.chk('duplicate SKU in the branch', pg_temp.saveprod('mgra', format($a$%L, null, 'Other', 'sh-1', 'bottle', 1, 5, true, 0$a$, pg_temp.id('bra')))->>'code', 'duplicate_sku');
  perform pg_temp.chk('direct stock_qty update refused for authenticated', pg_temp.try_as('mgra', format($q$update public.products set stock_qty = 999 where id = %L$q$, pg_temp.id('pr1'))), '42501');
  perform pg_temp.chk('direct stock_qty update refused even for postgres (guard)', pg_temp.try(format($q$update public.products set stock_qty = 999 where id = %L$q$, pg_temp.id('pr1'))), '42501');
  perform pg_temp.chk('...stock still 10', pg_temp.stock('pr1'), '10');
  perform pg_temp.chk('adjust: purchase +5', pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'purchase', 5)$q$, pg_temp.id('pr1')))->>'stock', '15');
  perform pg_temp.chk('adjust: correction -3 needs a reason', pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'adjustment', -3)$q$, pg_temp.id('pr1')))->>'code', 'reason_required');
  perform pg_temp.chk('adjust: zero quantity invalid', pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'adjustment', 0, 'nothing')$q$, pg_temp.id('pr1')))->>'code', 'invalid_quantity');
  perform pg_temp.chk('adjust: a negative purchase invalid', pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'purchase', -2)$q$, pg_temp.id('pr1')))->>'code', 'invalid_quantity');
  perform pg_temp.chk('adjust: a sale cannot be entered by hand (invalid_kind)', pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'sale', -2, 'sneaky')$q$, pg_temp.id('pr1')))->>'code', 'invalid_kind');
  perform pg_temp.chk('adjust: correction -3 with a reason', pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'adjustment', -3, 'Recount')$q$, pg_temp.id('pr1')))->>'stock', '12');
  perform pg_temp.chk('adjust: below zero refused by default, stock unchanged', (pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'adjustment', -13, 'Too many')$q$, pg_temp.id('pr1')))->>'code') || '/' || pg_temp.stock('pr1'), 'insufficient_stock/12');
  perform pg_temp.chk('adjust: receptionist / staff / other business refused', (pg_temp.as_('recep', format($q$select public.adjust_stock(%L, 'purchase', 1)$q$, pg_temp.id('pr1')))->>'code') || (pg_temp.as_('staffa', format($q$select public.adjust_stock(%L, 'purchase', 1)$q$, pg_temp.id('pr1')))->>'code') || (pg_temp.as_('ownerb', format($q$select public.adjust_stock(%L, 'purchase', 1)$q$, pg_temp.id('pr1')))->>'code'), 'forbiddenforbiddenforbidden');
  perform pg_temp.chk('movements sum to the stock (10 + 5 - 3)', (select sum(quantity)::text from public.stock_movements where product_id = pg_temp.id('pr1')) || '/' || pg_temp.stock('pr1'), '12/12');
  perform pg_temp.chk('stock_after is recorded on every movement', (select string_agg(stock_after::text, ',' order by created_at, stock_after) from public.stock_movements where product_id = pg_temp.id('pr1')), '10,12,15');
  perform pg_temp.chk('stock_movements: UPDATE / DELETE refused for postgres', pg_temp.try(format($q$update public.stock_movements set quantity = 1 where product_id = %L$q$, pg_temp.id('pr1'))) || '/' || pg_temp.try(format($q$delete from public.stock_movements where product_id = %L$q$, pg_temp.id('pr1'))), '23514/23514');
  perform pg_temp.chk('audit: product.created + inventory.stock_moved x2', pg_temp.audit_n('product.created') || '/' || pg_temp.audit_n('inventory.stock_moved'), '1/2');
  -- visibility
  perform pg_temp.chk('RLS: manager + receptionist see the product', pg_temp.vis('mgra', 'select 1 from public.products') || '/' || pg_temp.vis('recep', 'select 1 from public.products'), '1/1');
  perform pg_temp.chk('RLS: staff (no inventory.view), other business, stranger see none', pg_temp.vis('staffa', 'select 1 from public.products') || pg_temp.vis('ownerb', 'select 1 from public.products') || pg_temp.vis('stranger', 'select 1 from public.products'), '000');
  perform pg_temp.chk('RLS: movements follow the same rule', pg_temp.vis('recep', 'select 1 from public.stock_movements') || '/' || pg_temp.vis('staffa', 'select 1 from public.stock_movements') || '/' || pg_temp.vis('ownerb', 'select 1 from public.stock_movements'), '3/0/0');
  perform pg_temp.chk('RLS: the manager of branch A does not see a branch-B product', (pg_temp.saveprod('owner', format($a$%L, null, 'Karachi item', null, 'piece', 100, null, true, 5$a$, pg_temp.id('brb')))->>'ok') || '/' || pg_temp.vis('mgra', 'select 1 from public.products') || '/' || pg_temp.vis('owner', 'select 1 from public.products'), 'true/1/2');
end $$;

-- ===========================================================================
-- 8. Selling products (stock drops at ISSUE) + the setting
-- ===========================================================================
do $$
declare v_inv uuid; r jsonb; v_state text;
begin
  v_inv := pg_temp.draft('recep', 'c1', format($i$[{"product_id": "%s", "quantity": 4}]$i$, pg_temp.id('pr1')));
  perform pg_temp.chk('draft: a product line prefilled (name, price) and stock NOT touched by a draft', (select description || '/' || unit_price_minor from public.invoice_items where invoice_id = v_inv) || '/' || pg_temp.stock('pr1'), 'Shampoo/1500/12');
  perform pg_temp.chk('draft: unknown product', pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb)$q$, v_inv, format($i$[{"product_id": "%s"}]$i$, gen_random_uuid())))->>'code', 'unknown_product');
  perform pg_temp.chk('draft: a product of ANOTHER branch is unknown', pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb)$q$, v_inv, format($i$[{"product_id": "%s"}]$i$, (select id from public.products where name = 'Karachi item'))))->>'code', 'unknown_product');
  r := pg_temp.issue('recep', v_inv);
  perform pg_temp.chk('issue: ok', r->>'ok', 'true');
  insert into ids values ('inv_prod1', v_inv);
  perform pg_temp.chk('stock dropped 12 -> 8', pg_temp.stock('pr1'), '8');
  perform pg_temp.chk('stored sale movement: -4, stock_after 8, linked to invoice + line, creator', (select concat_ws('|', kind, quantity, stock_after, invoice_id = v_inv, invoice_item_id = (select id from public.invoice_items where invoice_id = v_inv), created_by = pg_temp.id('recep')) from public.stock_movements where invoice_id = v_inv), 'sale|-4|8|t|t|t');
  -- insufficient stock: the whole issue is refused, nothing changes
  v_inv := pg_temp.draft('recep', 'c1', format($i$[{"description": "Facial gift", "unit_price_minor": 500}, {"product_id": "%s", "quantity": 100}]$i$, pg_temp.id('pr1')));
  v_state := pg_temp.inv_state('biza');
  perform pg_temp.chk('issue with too many units: insufficient_stock (with stock + requested)', (pg_temp.issue('recep', v_inv)->>'code') || '/' || (pg_temp.issue('recep', v_inv)->>'stock') || '/' || (pg_temp.issue('recep', v_inv)->>'requested'), 'insufficient_stock/8/100');
  perform pg_temp.chk('...still a draft, counter unchanged, stock unchanged, no new movement', (select status::text from public.invoices where id = v_inv) || '/' || (pg_temp.inv_state('biza') = v_state)::text || '/' || pg_temp.stock('pr1') || '/' || (select count(*)::text from public.stock_movements where kind = 'sale'), 'draft/true/8/1');
  -- atomic with a package line on the same invoice: nothing is sold when stock fails
  perform pg_temp.as_('recep', format($q$select public.update_invoice_draft(%L, %L::jsonb)$q$, v_inv, format($i$[{"package_id": "%s"}, {"product_id": "%s", "quantity": 100}]$i$, pg_temp.id('p2'), pg_temp.id('pr1'))));
  perform pg_temp.chk('mixed invoice: a stock failure also leaves the package UNSOLD', (pg_temp.issue('recep', v_inv)->>'code') || '/' || (select count(*)::text from public.client_packages where invoice_id = v_inv), 'insufficient_stock/0');
  -- allow negative stock
  perform pg_temp.chk('settings: receptionist cannot change them', pg_temp.as_('recep', format($q$select public.set_inventory_settings(%L, true)$q$, pg_temp.id('bra')))->>'code', 'forbidden');
  perform pg_temp.chk('settings: manager allows negative stock', pg_temp.as_('mgra', format($q$select public.set_inventory_settings(%L, true)$q$, pg_temp.id('bra')))->>'ok', 'true');
  perform pg_temp.chk('settings: stored + audited', (select allow_negative_stock::text from public.inventory_settings where branch_id = pg_temp.id('bra')) || '/' || pg_temp.audit_n('inventory.settings_changed'), 'true/1');
  perform pg_temp.chk('...the same invoice now issues', pg_temp.issue('recep', v_inv)->>'ok', 'true');
  perform pg_temp.chk('...stock goes NEGATIVE (8 - 100 = -92) and the movement records it', pg_temp.stock('pr1') || '/' || (select stock_after::text from public.stock_movements where invoice_id = v_inv), '-92/-92');
  insert into ids values ('inv_mixed', v_inv);
  perform pg_temp.chk('low stock: the sale that crossed the alert level (8 -> -92, level 5) queued ONE email per member holding inventory.adjust (owner + manager)', (select count(*)::text from public.message_outbox where event = 'low_stock' and channel = 'email'), '2');
  perform pg_temp.chk('...recipients are exactly those two, never the receptionist or staff', (select string_agg(u.k, ',' order by u.k) from public.message_outbox o join ids u on u.v = o.user_id where o.event = 'low_stock'), 'mgra,owner');
  perform pg_temp.chk('...and a push row for each (staff_low_stock)', (select count(*)::text from public.message_outbox where event = 'staff_low_stock' and channel = 'push'), '2');
  perform pg_temp.chk('...stored payload names the product, stock and level; no address or token', (select concat_ws('|', payload->>'product', payload->>'stock', payload->>'threshold', payload->>'unit', payload->>'branch', (payload ? 'token')::text) from public.message_outbox where event = 'low_stock' limit 1), 'Shampoo|-92|5|bottle|Alpha|false');
  perform pg_temp.chk('...and the package on it WAS sold', (select count(*)::text from public.client_packages where invoice_id = v_inv), '1');
  perform pg_temp.as_('mgra', format($q$select public.set_inventory_settings(%L, false)$q$, pg_temp.id('bra')));
  perform pg_temp.chk('manual adjustment below zero is refused again once the setting is off', pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'adjustment', -1, 'still negative')$q$, pg_temp.id('pr1')))->>'code', 'insufficient_stock');
  perform pg_temp.chk('stock bought back: +100', pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'purchase', 100)$q$, pg_temp.id('pr1')))->>'stock', '8');
end $$;

-- ===========================================================================
-- 9. Credit notes: restore stock / cancel packages ONLY when the net is exhausted
-- ===========================================================================
do $$
declare r jsonb; v_cn uuid; v_state text; v_inv uuid; v_inv_unused uuid;
begin
  -- inv_prod1: 4 x 1500 = 6000 net, tax rate 0 => total 6000. A PARTIAL credit restores nothing.
  perform pg_temp.chk('credit note: receptionist refused', pg_temp.as_('recep', format($q$select public.create_credit_note(%L, 'x reason', 1000)$q$, pg_temp.id('inv_prod1')))->>'code', 'forbidden');
  r := pg_temp.as_('mgra', format($q$select public.create_credit_note(%L, 'Damaged bottle', 1500)$q$, pg_temp.id('inv_prod1')));
  perform pg_temp.chk('partial credit note: ok', r->>'ok', 'true');
  perform pg_temp.chk('...restores NOTHING (stock 8, still one movement for the line)', pg_temp.stock('pr1') || '/' || (select count(*)::text from public.stock_movements where invoice_id = pg_temp.id('inv_prod1')), '8/1');
  r := pg_temp.as_('mgra', format($q$select public.create_credit_note(%L, 'Customer returned the rest')$q$, pg_temp.id('inv_prod1')));
  perform pg_temp.chk('the credit that EXHAUSTS the net: ok', r->>'ok', 'true');
  v_cn := (r->>'credit_note_id')::uuid;
  perform pg_temp.chk('...restores every product line: stock 12', pg_temp.stock('pr1'), '12');
  perform pg_temp.chk('stored return movement: +4, linked to the credit note and the line, stock_after 12', (select concat_ws('|', kind, quantity, stock_after, credit_note_id = v_cn, invoice_item_id = (select id from public.invoice_items where invoice_id = pg_temp.id('inv_prod1')), reason) from public.stock_movements where invoice_id = pg_temp.id('inv_prod1') and kind = 'return'), 'return|4|12|t|t|Credit note ' || (select number from public.credit_notes where id = v_cn));
  perform pg_temp.chk('...a further credit note is refused (fully credited) and restores nothing more', (pg_temp.as_('mgra', format($q$select public.create_credit_note(%L, 'again please')$q$, pg_temp.id('inv_prod1')))->>'code') || '/' || pg_temp.stock('pr1'), 'fully_credited/12');

  -- a package with sessions used cannot be fully credited; state is exactly as before
  v_state := pg_temp.inv_state('biza');
  perform pg_temp.chk('full credit on a package with USED sessions: package_sessions_used', pg_temp.as_('mgra', format($q$select public.create_credit_note(%L, 'refund it all')$q$, pg_temp.id('inv_pkg1')))->>'code', 'package_sessions_used');
  perform pg_temp.chk('...no credit note, no cancellation, counters unchanged', (select count(*)::text from public.credit_notes where invoice_id = pg_temp.id('inv_pkg1')) || '/' || (select count(*)::text from public.client_package_cancellations) || '/' || (pg_temp.inv_state('biza') = v_state)::text, '0/0/true');
  perform pg_temp.chk('...a PARTIAL credit on it is fine and cancels nothing', (pg_temp.as_('mgra', format($q$select public.create_credit_note(%L, 'goodwill', 500)$q$, pg_temp.id('inv_pkg1')))->>'ok') || '/' || (select count(*)::text from public.client_package_cancellations), 'true/0');

  -- an UNUSED package: the exhausting credit cancels it; no more deductions
  v_inv_unused := pg_temp.draft('owner', 'c3', format($i$[{"package_id": "%s"}]$i$, pg_temp.id('p1')));
  perform pg_temp.issue('owner', v_inv_unused);
  insert into ids select 'cp3', id from public.client_packages where invoice_id = v_inv_unused;
  r := pg_temp.as_('mgra', format($q$select public.create_credit_note(%L, 'Sold by mistake')$q$, v_inv_unused));
  perform pg_temp.chk('full credit on an UNUSED package: ok', r->>'ok', 'true');
  perform pg_temp.chk('stored cancellation row: package + credit note + creator', (select concat_ws('|', credit_note_id = (r->>'credit_note_id')::uuid, created_by = pg_temp.id('mgra')) from public.client_package_cancellations where client_package_id = pg_temp.id('cp3')), 't|t');
  perform pg_temp.chk('...the client_package row itself is unchanged', (select concat_ws('|', sessions_purchased, sessions_bonus, price_minor) from public.client_packages where id = pg_temp.id('cp3')), '3|1|5000');
  perform pg_temp.chk('...a cancelled package cannot be used', pg_temp.as_('owner', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap11'), pg_temp.id('cp3')))->>'code', 'package_cancelled');
  perform pg_temp.chk('...it is listed as cancelled and never as usable', (pg_temp.as_('owner', format($q$select to_jsonb(t) from public.list_client_packages(%L) t where t.id = %L$q$, pg_temp.id('c3'), pg_temp.id('cp3')))->>'is_cancelled') || '/' || pg_temp.vis('owner', format($q$select 1 from public.list_client_packages(%L, null, true)$q$, pg_temp.id('c3'))), 'true/0');
  perform pg_temp.chk('audit: package.cancelled', pg_temp.audit_n('package.cancelled'), '1');
end $$;

-- ===========================================================================
-- 10. Visibility of packages and usages
-- ===========================================================================
do $$
begin
  perform pg_temp.chk('RLS client_packages: manager + receptionist see every client package at the branch', pg_temp.vis('mgra', 'select 1 from public.client_packages') || '/' || pg_temp.vis('recep', 'select 1 from public.client_packages'), '5/5');
  perform pg_temp.chk('RLS: Staff A (own scope) sees packages of clients THEY have appointments with (c1, c2) but not c3''s', pg_temp.vis('staffa', format($q$select 1 from public.client_packages where client_id = %L$q$, pg_temp.id('c3'))) || '/' || (pg_temp.vis('staffa', format($q$select 1 from public.client_packages where client_id in (%L, %L)$q$, pg_temp.id('c1'), pg_temp.id('c2'))) > '0')::text, '0/true');
  perform pg_temp.chk('RLS: other business and a stranger see nothing', pg_temp.vis('ownerb', 'select 1 from public.client_packages') || pg_temp.vis('stranger', 'select 1 from public.client_packages') || pg_temp.vis('ownerb', 'select 1 from public.session_usages') || pg_temp.vis('ownerb', 'select 1 from public.packages'), '0000');
  perform pg_temp.chk('RLS packages (definitions): manager + receptionist (packages.sell) see them; staff do not', pg_temp.vis('mgra', 'select 1 from public.packages') || '/' || pg_temp.vis('recep', 'select 1 from public.packages') || '/' || pg_temp.vis('staffa', 'select 1 from public.packages'), '2/2/0');
  perform pg_temp.chk('list_client_packages: other business sees none even by client id', pg_temp.vis('ownerb', format($q$select 1 from public.list_client_packages(%L)$q$, pg_temp.id('c1'))), '0');
  perform pg_temp.chk('low_stock_count: product at 12, threshold 5 => 0 low', pg_temp.as_q('mgra', format($q$select public.low_stock_count(%L)$q$, pg_temp.id('biza'))), '0');
  perform pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'adjustment', -7, 'Used in the salon')$q$, pg_temp.id('pr1')));
  perform pg_temp.chk('low stock: falling from 12 to 5 (= the level) crosses again: a second alert round (4 emails in total)', (select count(*)::text from public.message_outbox where event = 'low_stock'), '4');
  perform pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'adjustment', -1, 'Another one used')$q$, pg_temp.id('pr1')));
  perform pg_temp.chk('...already at/below the level: a further decrease does NOT alert again', (select count(*)::text from public.message_outbox where event = 'low_stock'), '4');
  perform pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'purchase', 1)$q$, pg_temp.id('pr1')));
  perform pg_temp.chk('...stock 5 = threshold 5 => 1 low (<=)', pg_temp.as_q('mgra', format($q$select public.low_stock_count(%L)$q$, pg_temp.id('biza'))), '1');
  perform pg_temp.chk('...staff / other business count 0 (RLS)', pg_temp.as_q('staffa', format($q$select public.low_stock_count(%L)$q$, pg_temp.id('biza'))) || pg_temp.as_q('ownerb', format($q$select public.low_stock_count(%L)$q$, pg_temp.id('biza'))), '00');
  perform pg_temp.as_('mgra', format($q$select public.save_product(%L, %L, 'Shampoo', 'SH-1', 'bottle', 1500, 5, false, 0)$q$, pg_temp.id('bra'), pg_temp.id('pr1')));
  perform pg_temp.chk('...an inactive product is not counted', pg_temp.as_q('mgra', format($q$select public.low_stock_count(%L)$q$, pg_temp.id('biza'))), '0');
  perform pg_temp.chk('an inactive product cannot go on a new draft', pg_temp.as_('recep', format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), pg_temp.id('c1'), format($i$[{"product_id": "%s"}]$i$, pg_temp.id('pr1'))))->>'code', 'unknown_product');
  perform pg_temp.as_('mgra', format($q$select public.save_product(%L, %L, 'Shampoo', 'SH-1', 'bottle', 1500, 5, true, 0)$q$, pg_temp.id('bra'), pg_temp.id('pr1')));
end $$;

-- outbox_guard on the queued alert: stale when restocked, when the add-on is off, when the recipient lost the permission
do $$
declare v_row uuid; v_user uuid := pg_temp.id('mgra');
begin
  select id into v_row from public.message_outbox where event = 'low_stock' and user_id = v_user order by created_at desc limit 1;
  perform pg_temp.chk('outbox_guard: product still low, add-on on, recipient still holds the permission => send', coalesce(public.outbox_guard(v_row), 'send'), 'send');
  perform pg_temp.chk('outbox_recipient resolves the member''s own login email', ((public.outbox_recipient(v_row)->>'address') is not null)::text, 'true');
  perform pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'purchase', 50)$q$, pg_temp.id('pr1')));
  perform pg_temp.chk('...restocked above the level before it was sent => stale', public.outbox_guard(v_row), 'stale');
  perform pg_temp.as_('mgra', format($q$select public.adjust_stock(%L, 'adjustment', -50, 'put back for the test')$q$, pg_temp.id('pr1')));
  delete from public.member_role_assignments where member_id = pg_temp.member('biza', 'mgra');
  perform pg_temp.chk('...the recipient lost the role => stale', public.outbox_guard(v_row), 'stale');
  perform pg_temp.act_as(pg_temp.id('owner'));
  perform pg_temp.add_member('biza', 'mgra', 'manager', 'bra');
end $$;

-- ===========================================================================
-- 11. Add-on OFF / ON and plan gating
-- ===========================================================================
do $$
declare v_inv uuid; v_state text;
begin
  -- a draft with both kinds of line, made while the add-ons are on
  v_inv := pg_temp.draft('owner', 'c1', format($i$[{"package_id": "%s"}, {"product_id": "%s", "quantity": 1}]$i$, pg_temp.id('p2'), pg_temp.id('pr1')));
  insert into ids values ('inv_gate', v_inv);
  -- downgrade to Team without the add-ons
  update public.business_subscriptions set status = 'active', plan = 'team', trial_ends_at = null where business_id = pg_temp.id('biza');
  perform pg_temp.chk('plan Team without add-ons: packages and inventory are OFF', public.business_has_feature(pg_temp.id('biza'), 'packages')::text || public.business_has_feature(pg_temp.id('biza'), 'inventory')::text, 'falsefalse');
  perform pg_temp.chk('my_features says so too', (pg_temp.as_('owner', format($q$select public.my_features(%L)$q$, pg_temp.id('biza')))->'features'->>'packages') || (pg_temp.as_('owner', format($q$select public.my_features(%L)$q$, pg_temp.id('biza')))->'features'->>'inventory'), 'falsefalse');
  perform pg_temp.chk('save_package refused: feature_unavailable', pg_temp.savepkg('owner', format($a$%L, null, 'Off', null, 1, 0, 1, null, array[%L]::uuid[], true$a$, pg_temp.id('bra'), pg_temp.id('svc')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('delete_package / deduct / reverse refused', (pg_temp.as_('owner', format($q$select public.delete_package(%L)$q$, pg_temp.id('p1')))->>'code') || '/' || (pg_temp.as_('owner', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap14'), pg_temp.id('cp1')))->>'code') || '/' || (pg_temp.as_('owner', format($q$select public.reverse_session(%L, 'reason here')$q$, pg_temp.id('u_r')))->>'code'), 'feature_unavailable/feature_unavailable/feature_unavailable');
  perform pg_temp.chk('save_product / adjust_stock / delete_product / settings refused', (pg_temp.saveprod('owner', format($a$%L, null, 'Off', null, 'piece', 1, null, true, 0$a$, pg_temp.id('bra')))->>'code') || '/' || (pg_temp.as_('owner', format($q$select public.adjust_stock(%L, 'purchase', 1)$q$, pg_temp.id('pr1')))->>'code') || '/' || (pg_temp.as_('owner', format($q$select public.delete_product(%L)$q$, pg_temp.id('pr1')))->>'code') || '/' || (pg_temp.as_('owner', format($q$select public.set_inventory_settings(%L, true)$q$, pg_temp.id('bra')))->>'code'), 'feature_unavailable/feature_unavailable/feature_unavailable/feature_unavailable');
  perform pg_temp.chk('...stored values untouched while off', pg_temp.stock('pr1') || '/' || (select count(*)::text from public.packages where deleted_at is null), '5/2');
  perform pg_temp.chk('new draft lines are refused while off', (pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), pg_temp.id('c1'), format($i$[{"package_id": "%s"}]$i$, pg_temp.id('p2'))))->>'code') || '/' || (pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L, null, %L, %L::jsonb)$q$, pg_temp.id('bra'), pg_temp.id('c1'), format($i$[{"product_id": "%s"}]$i$, pg_temp.id('pr1'))))->>'code'), 'feature_unavailable/feature_unavailable');
  v_state := pg_temp.inv_state('biza');
  perform pg_temp.chk('issuing an EXISTING draft with those lines is refused, nothing changes', (pg_temp.issue('owner', v_inv)->>'code') || '/' || (pg_temp.inv_state('biza') = v_state)::text || '/' || (select status::text from public.invoices where id = v_inv), 'feature_unavailable/true/draft');
  perform pg_temp.chk('RLS: with the add-on off, even the owner reads nothing', pg_temp.vis('owner', 'select 1 from public.products') || pg_temp.vis('owner', 'select 1 from public.packages') || pg_temp.vis('owner', 'select 1 from public.client_packages') || pg_temp.vis('owner', 'select 1 from public.stock_movements') || pg_temp.vis('owner', 'select 1 from public.session_usages'), '00000');
  perform pg_temp.chk('...low_stock_count and list_client_packages are empty', pg_temp.as_q('owner', format($q$select public.low_stock_count(%L)$q$, pg_temp.id('biza'))) || pg_temp.vis('owner', format($q$select 1 from public.list_client_packages(%L)$q$, pg_temp.id('c1'))), '00');
  -- an invoice already ISSUED can still be credited with the add-on off (money first)
  perform pg_temp.chk('a credit note still works with the add-on off, and cancels the unused package', (pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'Closing this out')$q$, pg_temp.id('inv_pkg2')))->>'ok'), 'true');
  -- turn the add-ons on
  insert into public.business_addons (business_id, addon_key, enabled) values (pg_temp.id('biza'), 'packages', true);
  perform pg_temp.chk('packages ON, inventory still OFF', public.business_has_feature(pg_temp.id('biza'), 'packages')::text || public.business_has_feature(pg_temp.id('biza'), 'inventory')::text, 'truefalse');
  perform pg_temp.chk('...packages work again, inventory RPCs still refuse', (pg_temp.as_('owner', format($q$select public.deduct_session(%L, %L)$q$, pg_temp.id('ap14'), pg_temp.id('cp1')))->>'ok') || '/' || (pg_temp.as_('owner', format($q$select public.adjust_stock(%L, 'purchase', 1)$q$, pg_temp.id('pr1')))->>'code'), 'true/feature_unavailable');
  perform pg_temp.chk('...a draft mixing both is refused at issue because inventory is off', pg_temp.issue('owner', v_inv)->>'code', 'feature_unavailable');
  insert into public.business_addons (business_id, addon_key, enabled) values (pg_temp.id('biza'), 'inventory', true);
  perform pg_temp.chk('both ON: the same draft now issues', pg_temp.issue('owner', v_inv)->>'ok', 'true');
  perform pg_temp.chk('...package sold + stock dropped', (select count(*)::text from public.client_packages where invoice_id = v_inv) || '/' || pg_temp.stock('pr1'), '1/4');
  -- trial over: nothing works
  update public.business_subscriptions set status = 'inactive' where business_id = pg_temp.id('biza');
  perform pg_temp.chk('an inactive business: every module RPC refused', (pg_temp.as_('owner', format($q$select public.adjust_stock(%L, 'purchase', 1)$q$, pg_temp.id('pr1')))->>'code'), 'forbidden');
  update public.business_subscriptions set status = 'active', plan = 'team' where business_id = pg_temp.id('biza');
end $$;

-- ===========================================================================
-- 12. Business delete releases every guarded row
-- ===========================================================================
do $$
declare v_biz uuid := pg_temp.id('biza');
begin
  set constraints all immediate;
  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete business: cascades through the packages / inventory ledgers', pg_temp.try(format($q$delete from public.businesses where id = %L$q$, v_biz)), 'ok');
  alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('...nothing left of them', (select count(*)::text from public.client_packages where business_id = v_biz) || (select count(*)::text from public.session_usages where business_id = v_biz) || (select count(*)::text from public.stock_movements where business_id = v_biz) || (select count(*)::text from public.products where business_id = v_biz) || (select count(*)::text from public.packages where business_id = v_biz), '00000');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
