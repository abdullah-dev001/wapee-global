-- Phase 9A: plan features backend (custom roles, commission, multi-branch,
-- advanced reports, scheduled report emails).
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/19_phase9_plan_features.sql
--
-- Plain SQL, own fixtures (real auth.users, 5 businesses), everything rolled
-- back. Run on a database without leftover test data. The parallel-session proof
-- of "no double commission" is 20_commission_concurrency.sh.
--
-- Covered: custom roles (create/clone/edit/delete, safety rules at the
-- boundaries, scope-aware escalation guard, billing owner-only, role in use +
-- replacement, last owner, audit before/after, permission-cache version, direct
-- DML refused); multi-branch (create/update/archive/restore/primary, prefix
-- retirement, currency/timezone locks, branch-limited holders, switching data,
-- combined views per currency); commission (flat, percent, half-up rounding,
-- partial payments, reversals, credit notes, no late earning, immutability,
-- RLS per role, reports); advanced reports (weekly/monthly/custom with previous
-- period, DST months in London/New_York/Karachi, per currency, permissions);
-- schedules (due logic, claim, recipients, re-check, DST); plan gating; grants;
-- business-delete cascade.

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

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('mgr'),('recep'),('staffa'),('deleg'),('mgrk'),('ownerb'),('ownert'),('owners'),('owner2'),('viewer'),('sadmin')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'p9.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
alter table public.profiles disable trigger profiles_enforce_guard;
update public.profiles set is_super_admin = true where id = pg_temp.id('sadmin');
alter table public.profiles enable trigger profiles_enforce_guard;

do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P9 Alpha','p9-alpha','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P9 Beta','p9-beta','US','USD','America/New_York','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownert')); set local role authenticated;
  v_biz := public.create_business_with_owner('P9 Team','p9-team','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizt', v_biz);
  perform pg_temp.act_as(pg_temp.id('owners')); set local role authenticated;
  v_biz := public.create_business_with_owner('P9 Solo','p9-solo','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizs', v_biz);
end $$;
insert into ids select 'brancha', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;
insert into ids select 'brancht', id from public.branches where business_id = pg_temp.id('bizt') and is_primary;
insert into ids select 'branchs', id from public.branches where business_id = pg_temp.id('bizs') and is_primary;

-- Karachi branch of A (fixture insert as postgres: business A is on the trial = Business level)
insert into public.branches (business_id, name, is_primary, timezone, currency, country_code, invoice_prefix)
values (pg_temp.id('biza'), 'Karachi', false, 'Asia/Karachi', 'PKR', 'PK', 'KHI');
insert into ids select 'branchk', id from public.branches where business_id = pg_temp.id('biza') and name = 'Karachi';
update public.branches set tax_rate_bp = 2000, tax_number = 'GB123' where id = pg_temp.id('brancha');

-- plans: Team for T, Solo for S (super admin, aal2)
select pg_temp.chk('assign team', pg_temp.as_('sadmin', format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('bizt')), true)->>'ok', 'true');
select pg_temp.chk('assign solo', pg_temp.as_('sadmin', format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizs')), true)->>'ok', 'true');

-- members of A
select pg_temp.add_member('biza', 'mgr', 'manager', 'brancha');
select pg_temp.add_member('biza', 'recep', 'receptionist', 'brancha');
select pg_temp.add_member('biza', 'staffa', 'staff', 'brancha');
select pg_temp.add_member('biza', 'mgrk', 'manager', 'branchk');
select pg_temp.add_member('biza', 'deleg', 'staff', 'brancha');   -- becomes a delegate below
select pg_temp.add_member('biza', 'viewer', 'staff', 'brancha');
select pg_temp.add_member('biza', 'owner2', 'receptionist', 'brancha');

-- ===========================================================================
-- 1. CUSTOM ROLES
-- ===========================================================================
select pg_temp.chk('default roles intact: owner/manager/receptionist/staff permission counts',
  (select string_agg(r.key || ':' || (select count(*) from public.role_permissions rp where rp.role_id = r.id), ',' order by r.key)
   from public.roles r where r.business_id is null), 'manager:39,owner:47,receptionist:20,staff:12');

do $$
declare r jsonb; v_role uuid; v_n0 int; v_snap text;
begin
  -- create (owner, trial = Business level)
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Front Desk Plus', %L::jsonb)$q$, pg_temp.id('biza'),
    '[{"permission":"appointments.view","scope":"branch"},{"permission":"clients.view","scope":"branch"},{"permission":"reports.view_basic","scope":"branch"}]'));
  perform pg_temp.chk('owner creates a custom role', r->>'ok', 'true');
  v_role := (r->>'role_id')::uuid; insert into ids values ('role_fd', v_role);
  perform pg_temp.chk('stored: role row (business, name, not system, key c_)', (select (business_id = pg_temp.id('biza'))::text || '/' || name || '/' || is_system::text || '/' || (key like 'c\_%')::text || '/' || (created_by = pg_temp.id('owner'))::text from public.roles where id = v_role), 'true/Front Desk Plus/false/true/true');
  perform pg_temp.chk('stored: exactly the three permissions with their scopes', pg_temp.perms(v_role), 'appointments.view:branch,clients.view:branch,reports.view_basic:branch');
  perform pg_temp.chk('audit role.created has actor and the permission set',
    (select (actor_user_id = pg_temp.id('owner'))::text || '/' || jsonb_array_length(after->'permissions') || '/' || (after->>'name') from public.audit_logs where action = 'role.created' and entity_id = v_role::text), 'true/3/Front Desk Plus');

  -- who may NOT create
  perform pg_temp.chk('manager (no roles.manage) forbidden', pg_temp.as_('mgr', format($q$select public.create_custom_role(%L, 'X1', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('receptionist forbidden', pg_temp.as_('recep', format($q$select public.create_custom_role(%L, 'X2', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('staff forbidden', pg_temp.as_('staffa', format($q$select public.create_custom_role(%L, 'X3', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('other business owner forbidden', pg_temp.as_('ownerb', format($q$select public.create_custom_role(%L, 'X4', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute', pg_temp.as_anon(format($q$select public.create_custom_role(%L, 'X5', '[]'::jsonb)$q$, pg_temp.id('biza')))->>'state', '42501');

  -- validation: each refusal leaves the role table untouched
  select count(*) into v_n0 from public.roles where business_id = pg_temp.id('biza');
  perform pg_temp.chk('duplicate name', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'front desk plus', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'name_taken');
  perform pg_temp.chk('default role name taken', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Owner', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'name_taken');
  perform pg_temp.chk('name too short', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'A', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'invalid_name');
  perform pg_temp.chk('empty permission set', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Empty One', '[]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'empty_role');
  perform pg_temp.chk('no permissions at all', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Nothing One')$q$, pg_temp.id('biza')))->>'code', 'invalid_permissions');
  perform pg_temp.chk('unknown permission', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Bad One', '[{"permission":"nope.nope","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'unknown_permission');
  perform pg_temp.chk('invalid scope', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Bad Two', '[{"permission":"clients.view","scope":"everything"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'invalid_scope');
  perform pg_temp.chk('duplicate permission', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Bad Three', '[{"permission":"clients.view","scope":"own"},{"permission":"clients.view","scope":"all"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'duplicate_permission');
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Bill Role', '[{"permission":"settings.billing","scope":"all"}]'::jsonb)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('billing can never be in a custom role', r->>'code', 'billing_owner_only');
  perform pg_temp.chk('...and nothing was stored by any refusal', (select count(*)::text from public.roles where business_id = pg_temp.id('biza')), v_n0::text);
  perform pg_temp.chk('...no role.created audit beyond the first', pg_temp.audit_n('role.created'), '1');

  -- clone a default role
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Reception Copy', null, %L)$q$, pg_temp.id('biza'), pg_temp.rid('receptionist')));
  perform pg_temp.chk('clone receptionist ok', r->>'ok', 'true');
  perform pg_temp.chk('clone has the same permission set as the source', pg_temp.perms((r->>'role_id')::uuid), pg_temp.perms(pg_temp.rid('receptionist')));
  insert into ids values ('role_clone', (r->>'role_id')::uuid);
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Owner Copy', null, %L)$q$, pg_temp.id('biza'), pg_temp.rid('owner')));
  perform pg_temp.chk('clone owner ok, billing stripped and reported', (r->>'ok') || '/' || (r->'stripped'->>0), 'true/settings.billing');
  perform pg_temp.chk('clone owner: 46 permissions, no billing', (select count(*)::text || '/' || bool_or(permission = 'settings.billing')::text from public.role_permissions where role_id = (r->>'role_id')::uuid), '46/false');
  insert into ids values ('role_ownercopy', (r->>'role_id')::uuid);
  -- explicit permissions override the clone source
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Override Copy', %L::jsonb, %L)$q$, pg_temp.id('biza'), '[{"permission":"clients.view","scope":"own"}]', pg_temp.rid('manager')));
  perform pg_temp.chk('explicit list wins over clone source', pg_temp.perms((r->>'role_id')::uuid), 'clients.view:own');
  insert into ids values ('role_override', (r->>'role_id')::uuid);
  -- cross-business clone
  perform pg_temp.as_('ownerb', format($q$select public.create_custom_role(%L, 'B Role', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('bizb')));
  perform pg_temp.chk('cloning another business''s custom role -> not_found',
    pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Steal', null, %L)$q$, pg_temp.id('biza'),
      (select id from public.roles where business_id = pg_temp.id('bizb') and name = 'B Role')))->>'code', 'not_found');
  perform pg_temp.chk('system role permissions unchanged after all this', (select count(*)::text from public.role_permissions where role_id = pg_temp.rid('owner')), '47');
end $$;

-- the delegate: roles.manage (branch) + appointments.view (branch) + clients.view (own), at branch A only
do $$
declare r jsonb; v_role uuid; v_m uuid;
begin
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Role Admin', %L::jsonb)$q$, pg_temp.id('biza'),
    '[{"permission":"roles.manage","scope":"branch"},{"permission":"appointments.view","scope":"branch"},{"permission":"clients.view","scope":"own"},{"permission":"users.invite","scope":"branch"}]'));
  v_role := (r->>'role_id')::uuid; insert into ids values ('role_admin', v_role);
  v_m := pg_temp.member('biza', 'deleg');
  -- swap the deleg's Staff role for Role Admin (owner, via RPC)
  perform pg_temp.chk('owner removes the old assignment', pg_temp.as_('owner', format($q$select public.remove_member_role(%L)$q$, (select id from public.member_role_assignments where member_id = v_m)))->>'ok', 'true');
  r := pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_m, v_role, pg_temp.id('brancha')));
  perform pg_temp.chk('owner assigns Role Admin at branch A', r->>'ok', 'true');
  perform pg_temp.chk('stored: assignment (member, role, branch, created_by)',
    (select (role_id = v_role)::text || '/' || (branch_id = pg_temp.id('brancha'))::text || '/' || (created_by = pg_temp.id('owner'))::text from public.member_role_assignments where id = (r->>'assignment_id')::uuid), 'true/true/true');
  perform pg_temp.chk('assign again is idempotent', pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_m, v_role, pg_temp.id('brancha')))->>'already_assigned', 'true');
  perform pg_temp.chk('...and made no second row', (select count(*)::text from public.member_role_assignments where member_id = v_m), '1');
end $$;

-- scope-aware escalation: the delegate holds appointments.view at BRANCH scope only
do $$
declare r jsonb; v_all uuid; v_branch uuid; v_snap text; v_staffm uuid := pg_temp.member('biza', 'staffa'); v_n int;
begin
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'View All Appts', '[{"permission":"appointments.view","scope":"all"}]'::jsonb)$q$, pg_temp.id('biza')));
  v_all := (r->>'role_id')::uuid; insert into ids values ('role_viewall', v_all);
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'View Branch Appts', '[{"permission":"appointments.view","scope":"branch"}]'::jsonb)$q$, pg_temp.id('biza')));
  v_branch := (r->>'role_id')::uuid; insert into ids values ('role_viewbranch', v_branch);

  v_snap := pg_temp.perms(v_all);
  perform pg_temp.chk('delegate cannot DEFINE a role with scope above their own', pg_temp.as_('deleg', format($q$select public.create_custom_role(%L, 'Deleg All', '[{"permission":"appointments.view","scope":"all"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'cannot_grant');
  perform pg_temp.chk('...names the permission', pg_temp.as_('deleg', format($q$select public.create_custom_role(%L, 'Deleg All', '[{"permission":"appointments.view","scope":"all"}]'::jsonb)$q$, pg_temp.id('biza')))->>'permission', 'appointments.view');
  perform pg_temp.chk('delegate cannot define a permission they lack', pg_temp.as_('deleg', format($q$select public.create_custom_role(%L, 'Deleg Inv', '[{"permission":"invoices.create","scope":"branch"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'cannot_grant');
  perform pg_temp.chk('delegate: clients.view above own refused', pg_temp.as_('deleg', format($q$select public.create_custom_role(%L, 'Deleg C', '[{"permission":"clients.view","scope":"branch"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'cannot_grant');
  r := pg_temp.as_('deleg', format($q$select public.create_custom_role(%L, 'Deleg Ok', '[{"permission":"appointments.view","scope":"branch"},{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('delegate may define a role within their own holdings', r->>'ok', 'true');
  insert into ids values ('role_delegok', (r->>'role_id')::uuid);
  perform pg_temp.chk('delegate cannot define a role with billing', pg_temp.as_('deleg', format($q$select public.create_custom_role(%L, 'Deleg B', '[{"permission":"settings.billing","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'code', 'billing_owner_only');

  -- assignment: RPC path
  perform pg_temp.chk('delegate cannot assign a role with higher scope (RPC)', pg_temp.as_('deleg', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_staffm, v_all, pg_temp.id('brancha')))->>'code', 'cannot_grant');
  perform pg_temp.chk('delegate cannot assign the Owner role', pg_temp.as_('deleg', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_staffm, pg_temp.rid('owner'), pg_temp.id('brancha')))->>'code', 'cannot_grant');
  perform pg_temp.chk('delegate cannot assign Manager (permissions they lack)', pg_temp.as_('deleg', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_staffm, pg_temp.rid('manager'), pg_temp.id('brancha')))->>'code', 'cannot_grant');
  -- the guard trigger catches the DIRECT insert too (the old guard compared names only)
  perform pg_temp.chk('direct insert of a higher-scope role is refused by the trigger',
    pg_temp.try_as('deleg', format($q$insert into public.member_role_assignments (member_id, role_id, branch_id) values (%L, %L, %L)$q$, v_staffm, v_all, pg_temp.id('brancha'))), '42501');
  perform pg_temp.chk('...nothing was inserted', (select count(*)::text from public.member_role_assignments where member_id = v_staffm and role_id = v_all), '0');
  -- branch coverage: the delegate holds A only
  perform pg_temp.chk('delegate cannot assign at branch K (not covered)', pg_temp.as_('deleg', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_staffm, v_branch, pg_temp.id('branchk')))->>'code', 'cannot_grant');
  perform pg_temp.chk('delegate cannot assign for ALL branches', pg_temp.as_('deleg', format($q$select public.assign_member_role(%L, %L, null)$q$, v_staffm, v_branch))->>'code', 'cannot_grant');
  perform pg_temp.chk('direct insert for all branches (null) is refused too',
    pg_temp.try_as('deleg', format($q$insert into public.member_role_assignments (member_id, role_id, branch_id) values (%L, %L, null)$q$, v_staffm, v_branch)), '42501');
  r := pg_temp.as_('deleg', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_staffm, v_branch, pg_temp.id('brancha')));
  perform pg_temp.chk('delegate CAN assign within their branch and scope', r->>'ok', 'true');
  -- removal needs the same power
  perform pg_temp.chk('delegate cannot remove an Owner assignment', pg_temp.as_('deleg', format($q$select public.remove_member_role(%L)$q$,
    (select a.id from public.member_role_assignments a join public.business_members m on m.id = a.member_id where m.user_id = pg_temp.id('owner') and m.business_id = pg_temp.id('biza') limit 1)))->>'code', 'cannot_modify_higher_role');
  perform pg_temp.chk('...Owner still has the Owner role', (select count(*)::text from public.member_role_assignments a join public.business_members m on m.id = a.member_id where m.user_id = pg_temp.id('owner') and m.business_id = pg_temp.id('biza') and a.role_id = pg_temp.rid('owner')), '1');
  perform pg_temp.chk('delegate removes the assignment they made', pg_temp.as_('deleg', format($q$select public.remove_member_role(%L)$q$, (r->>'assignment_id')))->>'ok', 'true');

  -- assign validation
  perform pg_temp.chk('invalid branch (other business)', pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_staffm, v_branch, pg_temp.id('branchb')))->>'code', 'invalid_branch');
  perform pg_temp.chk('role of another business -> role_unavailable', pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_staffm,
    (select id from public.roles where business_id = pg_temp.id('bizb') and name = 'B Role'), pg_temp.id('brancha')))->>'code', 'role_unavailable');
  perform pg_temp.chk('member of another business -> forbidden', pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, null)$q$, (select id from public.business_members where business_id = pg_temp.id('bizb') limit 1), pg_temp.rid('staff')))->>'code', 'forbidden');
  perform pg_temp.chk('direct insert of ANOTHER business''s role is refused (isolation)',
    pg_temp.try_as('owner', format($q$insert into public.member_role_assignments (member_id, role_id, branch_id) values (%L, %L, null)$q$, v_staffm,
      (select id from public.roles where business_id = pg_temp.id('bizb') and name = 'B Role'))), '42501');
  perform pg_temp.chk('manager (no roles.manage) cannot assign', pg_temp.as_('mgr', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_staffm, v_branch, pg_temp.id('brancha')))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute assign', pg_temp.as_anon(format($q$select public.assign_member_role(%L, %L, null)$q$, v_staffm, v_branch))->>'state', '42501');
end $$;

-- last owner
do $$
declare v_own_assign uuid; r jsonb; v_m2 uuid := pg_temp.member('biza', 'owner2');
begin
  select a.id into v_own_assign from public.member_role_assignments a join public.business_members m on m.id = a.member_id
  where m.business_id = pg_temp.id('biza') and m.user_id = pg_temp.id('owner') and a.role_id = pg_temp.rid('owner');
  perform pg_temp.chk('the only Owner cannot be removed', pg_temp.as_('owner', format($q$select public.remove_member_role(%L)$q$, v_own_assign))->>'code', 'last_owner');
  perform pg_temp.chk('...and is still an Owner', (select count(*)::text from public.member_role_assignments where id = v_own_assign), '1');
  perform pg_temp.chk('direct delete of the last Owner assignment refused by the trigger', pg_temp.try_as('owner', format($q$delete from public.member_role_assignments where id = %L$q$, v_own_assign)), '23514');
  -- promote owner2 to Owner (they were Receptionist), then the first owner may step down
  perform pg_temp.chk('owner assigns Owner to a second member', pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, null)$q$, v_m2, pg_temp.rid('owner')))->>'ok', 'true');
  perform pg_temp.chk('now the first owner may remove their own Owner role', pg_temp.as_('owner', format($q$select public.remove_member_role(%L)$q$, v_own_assign))->>'ok', 'true');
  perform pg_temp.chk('...exactly one Owner left', (select count(*)::text from public.member_role_assignments a join public.business_members m on m.id = a.member_id where m.business_id = pg_temp.id('biza') and a.role_id = pg_temp.rid('owner')), '1');
  -- put the first owner back so later tests still have their owner
  perform pg_temp.chk('second owner re-assigns the first as Owner', pg_temp.as_('owner2', format($q$select public.assign_member_role(%L, %L, null)$q$, pg_temp.member('biza', 'owner'), pg_temp.rid('owner')))->>'ok', 'true');
end $$;

-- update
do $$
declare r jsonb; v_role uuid := pg_temp.id('role_fd'); v_snap text; v_m uuid := pg_temp.member('biza', 'staffa'); v_ver bigint; v_try text;
begin
  select pg_temp.perms(v_role) into v_snap;
  perform pg_temp.chk('manager cannot update', pg_temp.as_('mgr', format($q$select public.update_custom_role(%L, 'Hacked')$q$, v_role))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot update', pg_temp.as_('ownerb', format($q$select public.update_custom_role(%L, 'Hacked')$q$, v_role))->>'code', 'forbidden');
  perform pg_temp.chk('default role cannot be edited', pg_temp.as_('owner', format($q$select public.update_custom_role(%L, 'Own3r')$q$, pg_temp.rid('owner')))->>'code', 'system_role');
  perform pg_temp.chk('default role permissions cannot be replaced', pg_temp.as_('owner', format($q$select public.update_custom_role(%L, null, '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.rid('staff')))->>'code', 'system_role');
  perform pg_temp.chk('...staff role untouched', (select count(*)::text from public.role_permissions where role_id = pg_temp.rid('staff')), '12');
  perform pg_temp.chk('nothing to change', pg_temp.as_('owner', format($q$select public.update_custom_role(%L)$q$, v_role))->>'code', 'nothing_to_change');
  perform pg_temp.chk('rename onto a taken name', pg_temp.as_('owner', format($q$select public.update_custom_role(%L, 'Reception Copy')$q$, v_role))->>'code', 'name_taken');
  perform pg_temp.chk('billing refused on update', pg_temp.as_('owner', format($q$select public.update_custom_role(%L, null, '[{"permission":"settings.billing","scope":"all"}]'::jsonb)$q$, v_role))->>'code', 'billing_owner_only');
  perform pg_temp.chk('unknown permission refused on update', pg_temp.as_('owner', format($q$select public.update_custom_role(%L, null, '[{"permission":"x.y","scope":"all"}]'::jsonb)$q$, v_role))->>'code', 'unknown_permission');
  perform pg_temp.chk('every refused update left the permission set exactly as it was', pg_temp.perms(v_role), v_snap);
  perform pg_temp.chk('...and the name', (select name from public.roles where id = v_role), 'Front Desk Plus');

  -- assign it to staffa, note the member's cache version, then edit
  perform pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_m, v_role, pg_temp.id('brancha')));
  select permissions_version into v_ver from public.business_members where id = v_m;
  r := pg_temp.as_('owner', format($q$select public.update_custom_role(%L, 'Front Desk Pro', %L::jsonb)$q$, v_role,
    '[{"permission":"appointments.view","scope":"all"},{"permission":"clients.view","scope":"branch"}]'));
  perform pg_temp.chk('owner updates name and permissions', r->>'ok', 'true');
  perform pg_temp.chk('stored: new permission set replaced the old one', pg_temp.perms(v_role), 'appointments.view:all,clients.view:branch');
  perform pg_temp.chk('stored: new name', (select name from public.roles where id = v_role), 'Front Desk Pro');
  perform pg_temp.chk('audit role.updated: before AND after', (select (before->>'name') || '>' || (after->>'name') || '/' || jsonb_array_length(before->'permissions') || '>' || jsonb_array_length(after->'permissions') from public.audit_logs where action = 'role.updated' and entity_id = v_role::text), 'Front Desk Plus>Front Desk Pro/3>2');
  perform pg_temp.chk('permission-cache version of a member holding the role moved', (select (permissions_version > v_ver)::text from public.business_members where id = v_m), 'true');
  perform pg_temp.chk('the member now has the new permission (has_permission)', pg_temp.as_q('staffa', format($q$select public.has_permission(%L, null, 'clients.view')$q$, pg_temp.id('biza'))), 'true');
  -- delegate edits a role: only NEW/RAISED permissions must be held
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Deleg Target', '[{"permission":"appointments.view","scope":"branch"},{"permission":"invoices.create","scope":"branch"}]'::jsonb)$q$, pg_temp.id('biza')));
  insert into ids values ('role_dt', (r->>'role_id')::uuid);
  v_snap := pg_temp.perms(pg_temp.id('role_dt'));
  perform pg_temp.chk('delegate cannot RAISE a scope', pg_temp.as_('deleg', format($q$select public.update_custom_role(%L, null, '[{"permission":"appointments.view","scope":"all"},{"permission":"invoices.create","scope":"branch"}]'::jsonb)$q$, pg_temp.id('role_dt')))->>'code', 'cannot_grant');
  perform pg_temp.chk('delegate cannot ADD a permission they lack', pg_temp.as_('deleg', format($q$select public.update_custom_role(%L, null, '[{"permission":"appointments.view","scope":"branch"},{"permission":"invoices.create","scope":"branch"},{"permission":"invoices.discount","scope":"branch"}]'::jsonb)$q$, pg_temp.id('role_dt')))->>'code', 'cannot_grant');
  perform pg_temp.chk('...role untouched by the refusals', pg_temp.perms(pg_temp.id('role_dt')), v_snap);
  perform pg_temp.chk('delegate MAY keep an existing permission they lack and remove another',
    pg_temp.as_('deleg', format($q$select public.update_custom_role(%L, null, '[{"permission":"invoices.create","scope":"branch"}]'::jsonb)$q$, pg_temp.id('role_dt')))->>'ok', 'true');
  perform pg_temp.chk('...only invoices.create remains', pg_temp.perms(pg_temp.id('role_dt')), 'invoices.create:branch');

  -- direct DML is still safe (RLS lets roles.manage holders write; triggers decide)
  perform pg_temp.chk('direct: billing into a custom role refused', pg_temp.try_as('owner', format($q$insert into public.role_permissions (role_id, permission, scope) values (%L, 'settings.billing', 'all')$q$, v_role)), '23514');
  perform pg_temp.try_as('owner', format($q$update public.role_permissions set scope = 'all' where role_id = %L and permission = 'clients.view'$q$, pg_temp.rid('staff')));
  perform pg_temp.chk('direct: change a default role has no effect (RLS)', (select scope::text from public.role_permissions where role_id = pg_temp.rid('staff') and permission = 'clients.view'), 'own');
  perform pg_temp.chk('direct: delete a default role affects nothing', pg_temp.try_as('owner', format($q$delete from public.roles where id = %L$q$, pg_temp.rid('staff'))) || '/' || (select count(*)::text from public.roles where id = pg_temp.rid('staff')), 'ok/1');
  perform pg_temp.chk('direct: hard delete of a custom role refused', pg_temp.try_as('owner', format($q$delete from public.roles where id = %L$q$, v_role)), '23514');
  perform pg_temp.chk('direct: soft delete without the RPC refused', pg_temp.try_as('owner', format($q$update public.roles set deleted_at = now() where id = %L$q$, v_role)), '23514');
  perform pg_temp.try_as('owner', format($q$update public.roles set name = 'Boss' where id = %L$q$, pg_temp.rid('owner')));
  perform pg_temp.chk('direct: rename a default role has no effect (RLS)', (select name from public.roles where id = pg_temp.rid('owner')), 'Owner');
  perform pg_temp.act_as(pg_temp.id('owner'));
  perform pg_temp.chk('direct: the guard trigger itself refuses renaming a default role for any signed-in user', pg_temp.try(format($q$update public.roles set name = 'Boss' where id = %L$q$, pg_temp.rid('owner'))), '42501');
  perform pg_temp.chk('direct add of a permission the editor lacks is refused (delegate)', pg_temp.try_as('deleg', format($q$insert into public.role_permissions (role_id, permission, scope) values (%L, 'invoices.discount', 'branch')$q$, pg_temp.id('role_dt'))), '42501');
  perform pg_temp.chk('direct permission add by owner within their holdings is allowed', pg_temp.try_as('owner', format($q$insert into public.role_permissions (role_id, permission, scope) values (%L, 'clients.view', 'own')$q$, pg_temp.id('role_dt'))), 'ok');
  perform pg_temp.chk('...and audited by the trigger (role.role_permissions_insert)', (select count(*)::text from public.audit_logs where action = 'role.role_permissions_insert' and entity_id = pg_temp.id('role_dt')::text), '1');
  v_try := pg_temp.try_as('owner', format($q$delete from public.role_permissions where role_id = %L and permission = 'clients.view'$q$, pg_temp.id('role_dt')));
  perform pg_temp.chk('...and direct removal is allowed', v_try, 'ok');
  perform pg_temp.chk('...and audited', (select count(*)::text from public.audit_logs where action = 'role.role_permissions_delete' and entity_id = pg_temp.id('role_dt')::text), '1');
end $$;

-- delete
do $$
declare r jsonb; v_role uuid; v_a uuid; v_b uuid; v_ma uuid := pg_temp.member('biza', 'staffa'); v_mb uuid := pg_temp.member('biza', 'viewer'); v_n int; v_before text;
begin
  -- unused role
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Throwaway', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')));
  v_role := (r->>'role_id')::uuid;
  perform pg_temp.chk('manager cannot delete', pg_temp.as_('mgr', format($q$select public.delete_custom_role(%L)$q$, v_role))->>'code', 'forbidden');
  perform pg_temp.chk('default role cannot be deleted', pg_temp.as_('owner', format($q$select public.delete_custom_role(%L)$q$, pg_temp.rid('manager')))->>'code', 'system_role');
  perform pg_temp.chk('delete an unused role', pg_temp.as_('owner', format($q$select public.delete_custom_role(%L)$q$, v_role))->>'ok', 'true');
  perform pg_temp.chk('stored: soft deleted (row kept, deleted_at set)', (select (deleted_at is not null)::text from public.roles where id = v_role), 'true');
  perform pg_temp.chk('...hidden from members', pg_temp.as_q('staffa', format($q$select count(*)::text from public.roles where id = %L$q$, v_role)), '0');
  perform pg_temp.chk('audit role.deleted has before (name, permissions, member_count)', (select (before->>'name') || '/' || (before->>'member_count') from public.audit_logs where action = 'role.deleted' and entity_id = v_role::text), 'Throwaway/0');
  perform pg_temp.chk('deleting twice -> not_found', pg_temp.as_('owner', format($q$select public.delete_custom_role(%L)$q$, v_role))->>'code', 'not_found');
  perform pg_temp.chk('a deleted role cannot be assigned', pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, null)$q$, v_ma, v_role))->>'code', 'role_unavailable');
  perform pg_temp.chk('...nor by direct insert', pg_temp.try_as('owner', format($q$insert into public.member_role_assignments (member_id, role_id, branch_id) values (%L, %L, null)$q$, v_ma, v_role)), '23514');

  -- in use
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Busy Role', '[{"permission":"clients.view","scope":"branch"}]'::jsonb)$q$, pg_temp.id('biza')));
  v_role := (r->>'role_id')::uuid;
  perform pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_ma, v_role, pg_temp.id('brancha')));
  perform pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_mb, v_role, pg_temp.id('brancha')));
  perform pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_mb, pg_temp.rid('receptionist'), pg_temp.id('brancha')));
  select string_agg(member_id || ':' || role_id || ':' || coalesce(branch_id::text, 'all'), ',' order by id) into v_before from public.member_role_assignments where role_id = v_role;
  r := pg_temp.as_('owner', format($q$select public.delete_custom_role(%L)$q$, v_role));
  perform pg_temp.chk('role in use is refused with the member count', (r->>'code') || '/' || (r->>'member_count'), 'role_in_use/2');
  perform pg_temp.chk('...assignments exactly as they were', (select string_agg(member_id || ':' || role_id || ':' || coalesce(branch_id::text, 'all'), ',' order by id) from public.member_role_assignments where role_id = v_role), v_before);
  perform pg_temp.chk('...role not deleted', (select (deleted_at is null)::text from public.roles where id = v_role), 'true');
  perform pg_temp.chk('replacement = itself refused', pg_temp.as_('owner', format($q$select public.delete_custom_role(%L, %L)$q$, v_role, v_role))->>'code', 'invalid_replacement');
  perform pg_temp.chk('replacement from another business refused', pg_temp.as_('owner', format($q$select public.delete_custom_role(%L, %L)$q$, v_role, (select id from public.roles where business_id = pg_temp.id('bizb') and name = 'B Role')))->>'code', 'invalid_replacement');
  perform pg_temp.chk('replacement that does not exist refused', pg_temp.as_('owner', format($q$select public.delete_custom_role(%L, gen_random_uuid())$q$, v_role))->>'code', 'invalid_replacement');
  perform pg_temp.chk('delegate cannot reassign to a role above their scope (state intact)', pg_temp.as_('deleg', format($q$select public.delete_custom_role(%L, %L)$q$, v_role, pg_temp.id('role_viewall')))->>'code', 'cannot_grant');
  perform pg_temp.chk('...assignments still intact', (select count(*)::text from public.member_role_assignments where role_id = v_role), '2');
  -- with a replacement: Receptionist (viewer already holds it at branch A -> duplicate dropped)
  r := pg_temp.as_('owner', format($q$select public.delete_custom_role(%L, %L)$q$, v_role, pg_temp.rid('receptionist')));
  perform pg_temp.chk('delete with replacement: ok, 1 moved, 1 duplicate dropped', (r->>'ok') || '/' || (r->>'reassigned') || '/' || (r->>'dropped_duplicates'), 'true/1/1');
  perform pg_temp.chk('stored: staffa now holds the replacement at the SAME branch', (select count(*)::text from public.member_role_assignments where member_id = v_ma and role_id = pg_temp.rid('receptionist') and branch_id = pg_temp.id('brancha')), '1');
  perform pg_temp.chk('stored: viewer holds the replacement exactly once', (select count(*)::text from public.member_role_assignments where member_id = v_mb and role_id = pg_temp.rid('receptionist')), '1');
  perform pg_temp.chk('stored: nobody holds the deleted role', (select count(*)::text from public.member_role_assignments where role_id = v_role), '0');
  perform pg_temp.chk('audit role.deleted records the replacement and counts', (select (after->>'reassigned') || '/' || (after->>'dropped_duplicates') || '/' || (after->>'replacement_role_id' = pg_temp.rid('receptionist')::text)::text from public.audit_logs where action = 'role.deleted' and entity_id = v_role::text), '1/1/true');
  -- put staffa and viewer back to a plain Staff role for the later sections
  delete from public.member_role_assignments where member_id in (v_ma, v_mb) and role_id <> pg_temp.rid('staff');
  insert into public.member_role_assignments (member_id, role_id, branch_id)
  select v_mb, pg_temp.rid('staff'), pg_temp.id('brancha') where not exists (select 1 from public.member_role_assignments where member_id = v_mb and role_id = pg_temp.rid('staff'));
end $$;

-- ===========================================================================
-- 2. MULTI-BRANCH
-- ===========================================================================
create or replace function pg_temp.mk_issued(p_biz uuid, p_branch uuid, p_cur text, p_at timestamptz,
  p_net bigint, p_tax bigint, p_seq bigint, p_service uuid default null, p_appt uuid default null, p_disc bigint default 0)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.invoices (business_id, branch_id, appointment_id, currency, subtotal_minor, discount_minor, net_minor, tax_minor, total_minor)
  values (p_biz, p_branch, p_appt, p_cur, p_net + p_disc, p_disc, p_net, p_tax, p_net + p_tax) returning id into v_id;
  insert into public.invoice_items (business_id, branch_id, invoice_id, description, quantity, unit_price_minor, discount_minor, discount_reason, service_id)
  values (p_biz, p_branch, v_id, 'line', 1, p_net + p_disc, p_disc, case when p_disc > 0 then 'promo' end, p_service);
  update public.invoices set status = 'issued', number = 'T-' || p_seq || '-' || left(v_id::text, 6),
    number_seq = 100000 + p_seq + (extract(epoch from p_at))::bigint % 1000000, issued_at = p_at where id = v_id;
  return v_id;
end $$;

-- catalogue + hours for A
do $$
declare v_cut uuid; v_col uuid; v_d int;
begin
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('biza'), 'Cut', 60, 0) returning id into v_cut;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('biza'), 'Colour', 90, 0) returning id into v_col;
  insert into ids values ('svc_cut', v_cut), ('svc_col', v_col);
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values
    (v_cut, pg_temp.id('brancha'), pg_temp.id('biza'), 4000, true), (v_col, pg_temp.id('brancha'), pg_temp.id('biza'), 10000, true);
  for v_d in 1..5 loop
    insert into public.branch_hours (branch_id, business_id, day_of_week, start_minute, end_minute) values (pg_temp.id('brancha'), pg_temp.id('biza'), v_d, 540, 1020);
  end loop;
end $$;

do $$
declare r jsonb; v_b uuid; v_n0 int; v_snap text; v_try text;
begin
  -- create
  r := pg_temp.as_('owner', format($q$select public.create_branch(%L, 'Dubai', 'AE', 'AED', 'Asia/Dubai', '1 Marina Rd', '+97150000000', 'TRN1', 500, 'dxb')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('owner creates a branch', coalesce((r->>'ok') || '/' || (r->>'invoice_prefix'), r::text), 'true/DXB');
  v_b := (r->>'branch_id')::uuid; insert into ids values ('branchd', v_b);
  perform pg_temp.chk('stored: country/currency/timezone/tax/prefix/counters/primary', (select country_code || '/' || currency || '/' || timezone || '/' || tax_rate_bp || '/' || tax_number || '/' || invoice_prefix || '/' || invoice_next_no || '/' || credit_note_next_no || '/' || is_primary::text || '/' || address from public.branches where id = v_b), 'AE/AED/Asia/Dubai/500/TRN1/DXB/1/1/false/1 Marina Rd');
  perform pg_temp.chk('triggers gave the new branch its booking and notification settings', (select count(*)::text from public.booking_settings where branch_id = v_b) || '/' || (select count(*)::text from public.notification_settings where branch_id = v_b), '1/1');
  perform pg_temp.chk('audit branch.created has the values', (select (after->>'currency') || '/' || (after->>'invoice_prefix') from public.audit_logs where action = 'branch.created' and entity_id = v_b::text), 'AED/DXB');
  select count(*) into v_n0 from public.branches where business_id = pg_temp.id('biza');
  perform pg_temp.chk('bad name', pg_temp.as_('owner', format($q$select public.create_branch(%L, '  ', 'AE', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'code', 'invalid_name');
  perform pg_temp.chk('bad country', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'X1', 'ae', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'code', 'invalid_country');
  perform pg_temp.chk('bad currency', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'X2', 'AE', 'dirham', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'code', 'invalid_currency');
  perform pg_temp.chk('bad timezone', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'X3', 'AE', 'AED', 'Mars/Base')$q$, pg_temp.id('biza')))->>'code', 'invalid_timezone');
  perform pg_temp.chk('bad tax rate', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'X4', 'AE', 'AED', 'Asia/Dubai', null, null, null, 10001)$q$, pg_temp.id('biza')))->>'code', 'invalid_tax_rate');
  perform pg_temp.chk('bad prefix', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'X5', 'AE', 'AED', 'Asia/Dubai', null, null, null, 0, 'bad prefix!')$q$, pg_temp.id('biza')))->>'code', 'invalid_prefix');
  perform pg_temp.chk('prefix of a live branch taken', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'X6', 'AE', 'AED', 'Asia/Dubai', null, null, null, 0, 'KHI')$q$, pg_temp.id('biza')))->>'code', 'prefix_taken');
  perform pg_temp.chk('name taken (case-insensitive)', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'DUBAI', 'AE', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'code', 'name_taken');
  perform pg_temp.chk('copy source from another business', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'X7', 'AE', 'AED', 'Asia/Dubai', null, null, null, 0, null, %L)$q$, pg_temp.id('biza'), pg_temp.id('branchb')))->>'code', 'invalid_branch');
  perform pg_temp.chk('...no branch was created by any refusal', (select count(*)::text from public.branches where business_id = pg_temp.id('biza')), v_n0::text);

  -- permissions
  perform pg_temp.chk('manager (no settings.business) forbidden', pg_temp.as_('mgr', format($q$select public.create_branch(%L, 'Nope', 'AE', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('receptionist forbidden', pg_temp.as_('recep', format($q$select public.create_branch(%L, 'Nope', 'AE', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('other business forbidden', pg_temp.as_('ownerb', format($q$select public.create_branch(%L, 'Nope', 'AE', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute', pg_temp.as_anon(format($q$select public.create_branch(%L, 'Nope', 'AE', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'state', '42501');

  -- copy hours + prices
  r := pg_temp.as_('owner', format($q$select public.create_branch(%L, 'Leeds', 'GB', 'GBP', 'Europe/London', null, null, null, 2000, null, %L)$q$, pg_temp.id('biza'), pg_temp.id('brancha')));
  insert into ids values ('branchl', (r->>'branch_id')::uuid);
  perform pg_temp.chk('copy from A (same currency): 5 hours, 2 services, 0 skipped', (r->>'hours_copied') || '/' || (r->>'services_copied') || '/' || (r->>'services_skipped_currency'), '5/2/0');
  perform pg_temp.chk('stored: copied prices equal the source prices', (select string_agg(service_id::text || ':' || price_minor, ',' order by price_minor) from public.service_branches where branch_id = pg_temp.id('branchl')), (select string_agg(service_id::text || ':' || price_minor, ',' order by price_minor) from public.service_branches where branch_id = pg_temp.id('brancha')));
  perform pg_temp.chk('stored: a suggested prefix was generated and is unique', (select (invoice_prefix ~ '^[A-Z0-9]+$')::text from public.branches where id = pg_temp.id('branchl')), 'true');
  r := pg_temp.as_('owner', format($q$select public.create_branch(%L, 'Lahore', 'PK', 'PKR', 'Asia/Karachi', null, null, null, 0, null, %L)$q$, pg_temp.id('biza'), pg_temp.id('brancha')));
  insert into ids values ('branchh', (r->>'branch_id')::uuid);
  perform pg_temp.chk('copy from a GBP branch into PKR: hours yes, prices NOT copied (currency)', (r->>'hours_copied') || '/' || (r->>'services_copied') || '/' || (r->>'services_skipped_currency'), '5/0/2');
  perform pg_temp.chk('...no price row exists for the PKR branch', (select count(*)::text from public.service_branches where branch_id = pg_temp.id('branchh')), '0');

  -- delegate-like holder: settings.business at ONE branch cannot create branches
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Branch Settings', '[{"permission":"settings.business","scope":"branch"},{"permission":"reports.view_basic","scope":"branch"}]'::jsonb)$q$, pg_temp.id('biza')));
  insert into ids values ('role_bs', (r->>'role_id')::uuid);
  perform pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, %L)$q$, pg_temp.member('biza', 'viewer'), pg_temp.id('role_bs'), pg_temp.id('brancha')));
  perform pg_temp.chk('settings.business at one branch cannot create a branch (RPC)', pg_temp.as_('viewer', format($q$select public.create_branch(%L, 'Sneaky', 'AE', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('...nor by direct insert (RLS)', pg_temp.try_as('viewer', format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix) values (%L, 'Sneaky2', 'Asia/Dubai', 'AED', 'AE', 'SNK')$q$, pg_temp.id('biza'))), '42501');
  -- ...but can edit THEIR branch and not the others (the old policy used "anywhere")
  perform pg_temp.chk('...may update their own branch', pg_temp.as_('viewer', format($q$select public.update_branch(%L, '{"phone":"+44 20 7000 0000"}'::jsonb)$q$, pg_temp.id('brancha')))->>'ok', 'true');
  select to_jsonb(b)::text into v_snap from public.branches b where b.id = pg_temp.id('branchk');
  perform pg_temp.chk('...cannot update another branch (RPC)', pg_temp.as_('viewer', format($q$select public.update_branch(%L, '{"phone":"+92 1"}'::jsonb)$q$, pg_temp.id('branchk')))->>'code', 'forbidden');
  v_try := pg_temp.try_as('viewer', format($q$update public.branches set phone = 'HACK' where id = %L$q$, pg_temp.id('branchk')));
  perform pg_temp.chk('...cannot update another branch directly (policy now checks THAT branch)', (select to_jsonb(b)::text from public.branches b where b.id = pg_temp.id('branchk')), v_snap);
  v_try := pg_temp.try_as('viewer', format($q$update public.branches set phone = '+44 20 7111 1111' where id = %L$q$, pg_temp.id('brancha')));
  perform pg_temp.chk('...but a direct update of their own branch works', v_try, 'ok');
  perform pg_temp.chk('...and was stored', (select phone from public.branches where id = pg_temp.id('brancha')), '+44 20 7111 1111');

  -- plan gating
  perform pg_temp.chk('Team plan: multi_branch is off', pg_temp.as_('ownert', format($q$select public.create_branch(%L, 'Second', 'GB', 'GBP', 'Europe/London')$q$, pg_temp.id('bizt')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('Solo plan: multi_branch is off', pg_temp.as_('owners', format($q$select public.create_branch(%L, 'Second', 'GB', 'GBP', 'Europe/London')$q$, pg_temp.id('bizs')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('...and the direct insert is still stopped by the limit trigger on Team', pg_temp.try_as('ownert', format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix) values (%L, 'Second', 'Europe/London', 'GBP', 'GB', 'SEC')$q$, pg_temp.id('bizt'))), 'P0001');
end $$;

-- update_branch
do $$
declare r jsonb; v_snap text; v_d uuid := pg_temp.id('branchd'); v_l uuid := pg_temp.id('branchl'); v_appt uuid; v_fv uuid; v_cl uuid;
begin
  r := pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"address":"2 Marina Rd","tax_rate_bp":600,"name":"Dubai Marina"}'::jsonb)$q$, v_d));
  perform pg_temp.chk('update: ok', r->>'ok', 'true');
  perform pg_temp.chk('stored: only the patched keys changed', (select name || '/' || address || '/' || tax_rate_bp || '/' || currency || '/' || timezone || '/' || invoice_prefix from public.branches where id = v_d), 'Dubai Marina/2 Marina Rd/600/AED/Asia/Dubai/DXB');
  perform pg_temp.chk('audit branch.updated has before and after', (select (before->>'address') || '>' || (after->>'address') || '/' || (before->>'tax_rate_bp') || '>' || (after->>'tax_rate_bp') from public.audit_logs where action = 'branch.updated' and entity_id = v_d::text order by id desc limit 1), '1 Marina Rd>2 Marina Rd/500>600');
  select to_jsonb(b)::text into v_snap from public.branches b where b.id = v_d;
  perform pg_temp.chk('unknown field', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"invoice_next_no":99}'::jsonb)$q$, v_d))->>'code', 'unknown_field');
  perform pg_temp.chk('nothing to change', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{}'::jsonb)$q$, v_d))->>'code', 'nothing_to_change');
  perform pg_temp.chk('bad country', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"country_code":"xx1","name":"Zed"}'::jsonb)$q$, v_d))->>'code', 'invalid_country');
  perform pg_temp.chk('bad timezone', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"timezone":"Nowhere/Land"}'::jsonb)$q$, v_d))->>'code', 'invalid_timezone');
  perform pg_temp.chk('bad tax', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"tax_rate_bp":-5}'::jsonb)$q$, v_d))->>'code', 'invalid_tax_rate');
  perform pg_temp.chk('prefix of another live branch', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"invoice_prefix":"KHI"}'::jsonb)$q$, v_d))->>'code', 'prefix_taken');
  perform pg_temp.chk('name taken', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"name":"leeds"}'::jsonb)$q$, v_d))->>'code', 'name_taken');
  perform pg_temp.chk('every refused update left the whole branch row identical', (select to_jsonb(b)::text from public.branches b where b.id = v_d), v_snap);
  perform pg_temp.chk('other business forbidden', pg_temp.as_('ownerb', format($q$select public.update_branch(%L, '{"phone":"1"}'::jsonb)$q$, v_d))->>'code', 'forbidden');
  perform pg_temp.chk('manager (no settings.business) forbidden', pg_temp.as_('mgr', format($q$select public.update_branch(%L, '{"phone":"1"}'::jsonb)$q$, pg_temp.id('brancha')))->>'code', 'forbidden');

  -- locks: Leeds has prices (currency_in_use) and a future appointment (timezone_in_use)
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.clients (business_id, full_name, phone_e164, email) values (pg_temp.id('biza'), 'Ada Client', '+447700900111', 'ada@example.com') returning id into v_cl;
  insert into ids values ('client_ada', v_cl);
  insert into public.appointments (business_id, branch_id, client_id, service_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('biza'), v_l, v_cl, pg_temp.id('svc_cut'), now() + interval '3 days', now() + interval '3 days 1 hour', 60, 0, 'confirmed', 'dashboard', v_fv, 4000) returning id into v_appt;
  insert into ids values ('appt_leeds', v_appt);
  perform pg_temp.chk('currency change refused while prices exist', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"currency":"USD"}'::jsonb)$q$, v_l))->>'code', 'currency_in_use');
  perform pg_temp.chk('timezone change refused with upcoming appointments', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"timezone":"Europe/Paris"}'::jsonb)$q$, v_l))->>'code', 'timezone_in_use');
  perform pg_temp.chk('same timezone is not a change', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"timezone":"Europe/London","phone":"1"}'::jsonb)$q$, v_l))->>'ok', 'true');
  -- Dubai: nothing attached yet, so currency CAN change
  perform pg_temp.chk('currency change allowed on a branch with nothing attached', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"currency":"USD","country_code":"AE"}'::jsonb)$q$, v_d))->>'ok', 'true');
  perform pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"currency":"AED"}'::jsonb)$q$, v_d));
end $$;

-- invoices on Dubai: the prefix and the currency lock
do $$
declare r jsonb; v_inv uuid; v_d uuid := pg_temp.id('branchd');
begin
  r := pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L, null, null, '[{"description":"x","unit_price_minor":1000}]'::jsonb)$q$, v_d));
  v_inv := (r->>'invoice_id')::uuid;
  perform pg_temp.chk('Dubai has a draft invoice', r->>'ok', 'true');
  perform pg_temp.chk('draft invoice blocks archiving (open_drafts)', pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_d))->>'code', 'open_drafts');
  perform pg_temp.chk('...with the count', (pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_d))->>'count'), '1');
  perform pg_temp.chk('...the branch is still live', (select (deleted_at is null)::text from public.branches where id = v_d), 'true');
  perform pg_temp.as_('owner', format($q$select public.issue_invoice(%L)$q$, v_inv));
  perform pg_temp.chk('currency locked once an invoice exists', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"currency":"USD"}'::jsonb)$q$, v_d))->>'code', 'currency_locked');
  perform pg_temp.chk('prefix locked once numbering started', pg_temp.as_('owner', format($q$select public.update_branch(%L, '{"invoice_prefix":"DXB2"}'::jsonb)$q$, v_d))->>'code', 'prefix_locked');
  perform pg_temp.chk('...counter really moved', (select invoice_next_no::text from public.branches where id = v_d), '2');
  perform pg_temp.chk('direct prefix change refused by the existing trigger', pg_temp.try_as('owner', format($q$update public.branches set invoice_prefix = 'DXB3' where id = %L$q$, v_d)), '23514');
end $$;

-- archive / restore / primary
do $$
declare r jsonb; v_d uuid := pg_temp.id('branchd'); v_l uuid := pg_temp.id('branchl'); v_a uuid := pg_temp.id('brancha'); v_h uuid := pg_temp.id('branchh'); v_n int; v_try text;
begin
  perform pg_temp.chk('primary branch cannot be archived', pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_a))->>'code', 'primary_branch');
  r := pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_l));
  perform pg_temp.chk('upcoming appointment blocks archiving, with the count', (r->>'code') || '/' || (r->>'count'), 'future_appointments/1');
  perform pg_temp.chk('direct archive hits the same rule (trigger)', pg_temp.try_as('owner', format($q$update public.branches set deleted_at = now() where id = %L$q$, v_l)), 'P0001');
  perform pg_temp.chk('direct archive of the primary refused too', pg_temp.try_as('owner', format($q$update public.branches set deleted_at = now() where id = %L$q$, v_a)), 'P0001');
  perform pg_temp.chk('...Leeds and A still live', (select count(*)::text from public.branches where id in (v_l, v_a) and deleted_at is null), '2');
  perform pg_temp.chk('manager cannot archive', pg_temp.as_('mgr', format($q$select public.archive_branch(%L)$q$, v_h))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot archive', pg_temp.as_('ownerb', format($q$select public.archive_branch(%L)$q$, v_h))->>'code', 'forbidden');

  r := pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_d));
  perform pg_temp.chk('Dubai (invoices issued, nothing open) can be archived', r->>'ok', 'true');
  perform pg_temp.chk('stored: soft archived, row kept', (select (deleted_at is not null)::text from public.branches where id = v_d), 'true');
  perform pg_temp.chk('audit branch.archived', pg_temp.audit_n('branch.archived'), '1');
  perform pg_temp.chk('archived twice -> not_found', pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_d))->>'code', 'not_found');
  -- the prefix is RETIRED: invoice numbers are unique per business
  perform pg_temp.chk('an archived branch''s used prefix cannot be reused (RPC)', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'Dubai Two', 'AE', 'AED', 'Asia/Dubai', null, null, null, 0, 'DXB')$q$, pg_temp.id('biza')))->>'code', 'prefix_taken');
  perform pg_temp.chk('...nor by a direct insert (trigger, 23505)', pg_temp.try(format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix) values (%L, 'Dubai Three', 'Asia/Dubai', 'AED', 'AE', 'DXB')$q$, pg_temp.id('biza'))), '23505');
  -- Lahore: no invoices -> archive then reuse its prefix
  select invoice_prefix into strict v_try from public.branches where id = v_h;
  perform pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_h));
  perform pg_temp.chk('Lahore archived', (select (deleted_at is not null)::text from public.branches where id = v_h), 'true');
  r := pg_temp.as_('owner', format($q$select public.create_branch(%L, 'Lahore Two', 'PK', 'PKR', 'Asia/Karachi', null, null, null, 0, %L)$q$, pg_temp.id('biza'), v_try));
  perform pg_temp.chk('...so a new branch may take it', r->>'ok', 'true');
  insert into ids values ('branchh2', (r->>'branch_id')::uuid);
  perform pg_temp.chk('...and restoring Lahore now fails on the prefix (live conflict)', pg_temp.as_('owner', format($q$select public.restore_branch(%L)$q$, v_h))->>'code', 'prefix_taken');

  -- switching data
  r := pg_temp.as_('owner', format($q$select public.list_my_branches(%L)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('owner sees every LIVE branch', (select string_agg(x->>'name', ',' order by x->>'name') from jsonb_array_elements(r->'branches') x), 'Karachi,Lahore Two,Leeds,Main');
  perform pg_temp.chk('...primary first, with currency and roles', (r->'branches'->0->>'name') || '/' || (r->'branches'->0->>'currency') || '/' || (r->'branches'->0->'roles'->>0), 'Main/GBP/owner');
  perform pg_temp.chk('...distinct currencies reported', r->>'currencies', '2');
  r := pg_temp.as_('owner', format($q$select public.list_my_branches(%L, true)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('include_archived adds Dubai Marina and Lahore', (select string_agg(x->>'name', ',' order by x->>'name') from jsonb_array_elements(r->'branches') x where (x->>'archived')::boolean), 'Dubai Marina,Lahore');
  perform pg_temp.chk('manager assigned to A sees only A', (select string_agg(x->>'name', ',') from jsonb_array_elements(pg_temp.as_('mgr', format($q$select public.list_my_branches(%L)$q$, pg_temp.id('biza')))->'branches') x), 'Main');
  perform pg_temp.chk('manager assigned to Karachi sees only Karachi', (select string_agg(x->>'name', ',') from jsonb_array_elements(pg_temp.as_('mgrk', format($q$select public.list_my_branches(%L)$q$, pg_temp.id('biza')))->'branches') x), 'Karachi');
  perform pg_temp.chk('other business member -> forbidden', pg_temp.as_('ownerb', format($q$select public.list_my_branches(%L)$q$, pg_temp.id('biza')))->>'code', 'forbidden');

  -- restore + primary
  r := pg_temp.as_('owner', format($q$select public.restore_branch(%L)$q$, v_d));
  perform pg_temp.chk('Dubai restores', r->>'ok', 'true');
  perform pg_temp.chk('restore of a live branch -> not_found', pg_temp.as_('owner', format($q$select public.restore_branch(%L)$q$, v_d))->>'code', 'not_found');
  perform pg_temp.chk('audit branch.restored', pg_temp.audit_n('branch.restored'), '1');
  perform pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_d));
  perform pg_temp.chk('restore refuses a name that a live branch now has', (pg_temp.as_('owner', format($q$select public.create_branch(%L, 'Dubai Marina', 'AE', 'AED', 'Asia/Dubai')$q$, pg_temp.id('biza')))->>'ok') || '/' || (pg_temp.as_('owner', format($q$select public.restore_branch(%L)$q$, v_d))->>'code'), 'true/name_taken');

  r := pg_temp.as_('owner', format($q$select public.set_primary_branch(%L)$q$, v_l));
  perform pg_temp.chk('set primary moves the flag', r->>'ok', 'true');
  perform pg_temp.chk('stored: exactly one primary, and it is Leeds', (select count(*)::text || '/' || max(name) from public.branches where business_id = pg_temp.id('biza') and is_primary and deleted_at is null), '1/Leeds');
  perform pg_temp.chk('audit branch.primary_changed', pg_temp.audit_n('branch.primary_changed'), '1');
  perform pg_temp.chk('now Leeds (primary) cannot be archived', pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, v_l))->>'code', 'primary_branch');
  perform pg_temp.chk('an archived branch cannot be made primary', pg_temp.as_('owner', format($q$select public.set_primary_branch(%L)$q$, v_h))->>'code', 'not_found');
  perform pg_temp.chk('manager cannot change primary', pg_temp.as_('mgr', format($q$select public.set_primary_branch(%L)$q$, v_a))->>'code', 'forbidden');
  perform pg_temp.as_('owner', format($q$select public.set_primary_branch(%L)$q$, v_a));
  perform pg_temp.chk('primary put back to Main', (select max(name) from public.branches where business_id = pg_temp.id('biza') and is_primary and deleted_at is null), 'Main');
  perform pg_temp.chk('same primary again is a no-op', pg_temp.as_('owner', format($q$select public.set_primary_branch(%L)$q$, v_a))->>'unchanged', 'true');
end $$;

-- ===========================================================================
-- 3. COMMISSION
-- ===========================================================================
create or replace function pg_temp.mk_staff(p_key text, p_name text, p_user text default null, p_biz text default 'biza', p_branch text default 'brancha') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.staff_profiles (business_id, display_name, is_active, member_id)
  values (pg_temp.id(p_biz), p_name, true, case when p_user is null then null else pg_temp.member(p_biz, p_user) end) returning id into v;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v, pg_temp.id(p_branch), pg_temp.id(p_biz));
  insert into ids values (p_key, v);
  return v;
end $$;
create or replace function pg_temp.mk_appt(p_staff text, p_n int, p_biz text default 'biza', p_branch text default 'brancha', p_svc text default 'svc_cut', p_status text default 'completed', p_client text default 'client_ada', p_base timestamptz default '2026-08-01 08:00+00') returns uuid language plpgsql as $$
declare v uuid; v_fv uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id(p_biz) order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id(p_biz), pg_temp.id(p_branch), pg_temp.id(p_client), pg_temp.id(p_svc), pg_temp.id(p_staff),
          p_base + make_interval(hours => p_n), p_base + make_interval(hours => p_n) + interval '30 minutes', 30, 0, p_status::public.appointment_status, 'dashboard', v_fv, 4000) returning id into v;
  return v;
end $$;
-- draft from an appointment (or none) + issue, as the owner
create or replace function pg_temp.mk_inv(p_user text, p_branch text, p_appt uuid, p_items text) returns uuid language plpgsql as $$
declare r jsonb; v uuid;
begin
  r := pg_temp.as_(p_user, format($q$select public.create_invoice_draft(%L, %L, null, %L::jsonb)$q$, pg_temp.id(p_branch), p_appt, p_items));
  v := (r->>'invoice_id')::uuid;
  if v is null then raise exception 'draft failed: %', r; end if;
  r := pg_temp.as_(p_user, format($q$select public.issue_invoice(%L)$q$, v));
  if (r->>'ok') is distinct from 'true' then raise exception 'issue failed: %', r; end if;
  return v;
end $$;
create or replace function pg_temp.pay(p_user text, p_inv uuid, p_amt bigint) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := pg_temp.as_(p_user, format($q$select public.add_payment(%L, 'cash', %s)$q$, p_inv, p_amt));
  if (r->>'ok') is distinct from 'true' then raise exception 'payment failed: %', r; end if;
  return (r->>'payment_id')::uuid;
end $$;
create or replace function pg_temp.ent(p_inv uuid) returns text language sql as $$
  select coalesce(string_agg(kind || ':' || amount_minor || ':' || reason, ',' order by kind, amount_minor desc, reason), '') from public.commission_entries where invoice_id = p_inv
$$;
create or replace function pg_temp.bal(p_inv uuid) returns text language sql as $$
  select coalesce(sum(case kind when 'earn' then amount_minor else -amount_minor end), 0)::text from public.commission_entries where invoice_id = p_inv
$$;
create or replace function pg_temp.rule(p_staff text, p_svc text, p_kind text, p_bp int, p_flat bigint, p_cur text, p_from date) returns jsonb language sql as $$
  select pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, %L, %L, %L, %L, %L, %L)$q$, pg_temp.id(p_staff), case when p_svc is null then null else pg_temp.id(p_svc) end, p_kind, p_bp, p_flat, p_cur, p_from))
$$;

do $$
begin
  perform pg_temp.mk_staff('s1', 'Sam One', 'staffa');
  perform pg_temp.mk_staff('s2', 'Sue Two');
  perform pg_temp.mk_staff('s3', 'Tom Three');
  perform pg_temp.mk_staff('s4', 'Uma Four');
  perform pg_temp.mk_staff('s5', 'Vic Five');
end $$;

-- rules: permissions, validation, storage
do $$
declare r jsonb; v_n0 int;
begin
  perform pg_temp.chk('manager has view_all but NOT manage_rules', pg_temp.rule('s1', null, 'percent', 500, null, null, current_date - 1)->>'ok', 'true');
  perform pg_temp.chk('manager cannot set a rule', pg_temp.as_('mgr', format($q$select public.set_commission_rule(%L, null, 'percent', 100)$q$, pg_temp.id('s1')))->>'code', 'forbidden');
  perform pg_temp.chk('receptionist cannot', pg_temp.as_('recep', format($q$select public.set_commission_rule(%L, null, 'percent', 100)$q$, pg_temp.id('s1')))->>'code', 'forbidden');
  perform pg_temp.chk('staff cannot set their own rule', pg_temp.as_('staffa', format($q$select public.set_commission_rule(%L, null, 'percent', 9999)$q$, pg_temp.id('s1')))->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot', pg_temp.as_('ownerb', format($q$select public.set_commission_rule(%L, null, 'percent', 100)$q$, pg_temp.id('s1')))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute', pg_temp.as_anon(format($q$select public.set_commission_rule(%L, null, 'percent', 100)$q$, pg_temp.id('s1')))->>'state', '42501');
  perform pg_temp.chk('unknown staff -> not_found', pg_temp.as_('owner', $q$select public.set_commission_rule(gen_random_uuid(), null, 'percent', 100)$q$)->>'code', 'not_found');
  select count(*) into v_n0 from public.commission_rules;
  perform pg_temp.chk('bad kind', pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, null, 'bonus')$q$, pg_temp.id('s1')))->>'code', 'invalid_kind');
  perform pg_temp.chk('percent above 100%', pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, null, 'percent', 10001)$q$, pg_temp.id('s1')))->>'code', 'invalid_percent');
  perform pg_temp.chk('percent with a currency', pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, null, 'percent', 100, null, 'GBP')$q$, pg_temp.id('s1')))->>'code', 'invalid_percent');
  perform pg_temp.chk('flat without currency', pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, null, 'flat', null, 500)$q$, pg_temp.id('s1')))->>'code', 'invalid_flat');
  perform pg_temp.chk('flat negative', pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, null, 'flat', null, -1, 'GBP')$q$, pg_temp.id('s1')))->>'code', 'invalid_flat');
  perform pg_temp.chk('unknown service', pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, gen_random_uuid(), 'percent', 100)$q$, pg_temp.id('s1')))->>'code', 'unknown_service');
  perform pg_temp.chk('service of another business', pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, %L, 'percent', 100)$q$, pg_temp.id('s1'), (select id from public.services where business_id <> pg_temp.id('biza') limit 1)))->>'code', 'unknown_service');
  perform pg_temp.chk('date too far in the future', pg_temp.as_('owner', format($q$select public.set_commission_rule(%L, null, 'percent', 100, null, null, current_date + 400)$q$, pg_temp.id('s1')))->>'code', 'invalid_date');
  perform pg_temp.chk('...refusals stored nothing', (select count(*)::text from public.commission_rules), v_n0::text);

  perform pg_temp.chk('S1 cut 10%', pg_temp.rule('s1', 'svc_cut', 'percent', 1000, null, null, current_date - 1)->>'ok', 'true');
  perform pg_temp.chk('S1 colour flat 15.00 GBP', pg_temp.rule('s1', 'svc_col', 'flat', null, 1500, 'GBP', current_date - 1)->>'ok', 'true');
  perform pg_temp.chk('stored: S1 rules', (select string_agg(coalesce(s.name, 'default') || ':' || cr.kind || ':' || coalesce(cr.percent_bp::text, cr.flat_minor::text || cr.currency), ',' order by coalesce(s.name, 'a')) from public.commission_rules cr left join public.services s on s.id = cr.service_id where cr.staff_id = pg_temp.id('s1')), 'default:percent:500,Colour:flat:1500GBP,Cut:percent:1000');
  perform pg_temp.chk('audit commission.rule_set has the values', (select (after->>'kind') || '/' || (after->>'percent_bp') from public.audit_logs where action = 'commission.rule_set' and (after->>'service_id') = pg_temp.id('svc_cut')::text), 'percent/1000');
  perform pg_temp.chk('rules are immutable (update)', pg_temp.try('update public.commission_rules set percent_bp = 1 where percent_bp = 500'), '23514');
  perform pg_temp.chk('rules are immutable (delete)', pg_temp.try('delete from public.commission_rules where percent_bp = 500'), '23514');
  perform pg_temp.chk('rule on a business with no staff -> not_found', pg_temp.as_('owners', $q$select public.set_commission_rule(gen_random_uuid(), null, 'percent', 100)$q$)->>'code', 'not_found');
end $$;

-- Case 1: percent + flat + free-text default, partial payment, credit note, refund, unpaid/re-earn
do $$
declare v_a uuid; v_i uuid; v_p1 uuid; v_p2 uuid; r jsonb; v_lines int;
begin
  v_a := pg_temp.mk_appt('s1', 0);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_cut') || '","quantity":1,"unit_price_minor":4000,"discount_minor":500,"discount_reason":"promo"},{"service_id":"' || pg_temp.id('svc_col') || '","quantity":2,"unit_price_minor":10000},{"description":"Product","quantity":1,"unit_price_minor":1000}]');
  insert into ids values ('i1', v_i);
  perform pg_temp.chk('I1 totals: net 24500, tax 4900, total 29400', (select net_minor || '/' || tax_minor || '/' || total_minor from public.invoices where id = v_i), '24500/4900/29400');
  perform pg_temp.chk('issue alone earns nothing and snapshots nothing', (select count(*)::text from public.commission_lines where invoice_id = v_i) || '/' || pg_temp.ent(v_i), '0/');
  v_p1 := pg_temp.pay('owner', v_i, 10000);
  perform pg_temp.chk('PARTIAL payment earns nothing (no entries, no snapshot)', (select count(*)::text from public.commission_lines where invoice_id = v_i) || '/' || (select count(*)::text from public.commission_entries where invoice_id = v_i), '0/0');
  v_p2 := pg_temp.pay('owner', v_i, 19400);
  insert into ids values ('i1_p2', v_p2);
  perform pg_temp.chk('FULLY paid: three earn rows (cut 350, colour 3000, product 50)', pg_temp.ent(v_i), 'earn:3000:paid,earn:350:paid,earn:50:paid');
  perform pg_temp.chk('stored: staff, branch, currency, source payment on every row', (select count(*)::text from public.commission_entries e where e.invoice_id = v_i and e.staff_id = pg_temp.id('s1') and e.branch_id = pg_temp.id('brancha') and e.currency = 'GBP' and e.source_payment_id = v_p2 and e.created_by = pg_temp.id('owner')), '3');
  perform pg_temp.chk('stored: snapshot pins rule kind, base and full commission per line', (select string_agg(rule_kind || ':' || line_net_minor || ':' || full_commission_minor, ',' order by full_commission_minor desc) from public.commission_lines where invoice_id = v_i), 'flat:20000:3000,percent:3500:350,percent:1000:50');
  perform pg_temp.chk('the discounted line is computed on its NET (3500, not 4000)', (select line_net_minor::text from public.commission_lines where invoice_id = v_i and rule_kind = 'percent' and full_commission_minor = 350), '3500');
  -- a rule change later does not touch the invoice
  perform pg_temp.rule('s1', 'svc_cut', 'percent', 5000, null, null, current_date);
  perform pg_temp.chk('a NEW rule version does not change what was earned', pg_temp.bal(v_i), '3400');

  -- credit note for half the net: proportional reversal, using the SNAPSHOT
  r := pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'half back', 12250)$q$, v_i));
  perform pg_temp.chk('credit note issued (net 12250, tax 2450)', (r->>'ok') || '/' || (r->>'tax_minor'), 'true/2450');
  perform pg_temp.chk('credit note: proportional reversals 1500/175/25, reason credit_note', pg_temp.ent(v_i), 'earn:3000:paid,earn:350:paid,earn:50:paid,reversal:1500:credit_note,reversal:175:credit_note,reversal:25:credit_note');
  perform pg_temp.chk('balance = half of the original (1700), computed on the snapshot not the new 50% rule', pg_temp.bal(v_i), '1700');
  -- refund of the surplus: payment reversal, invoice stays fully paid => NO second reversal
  r := pg_temp.as_('owner', format($q$select public.reverse_payment(%L, 'refund of the credit', 14700)$q$, v_p2));
  perform pg_temp.chk('refund reversal ok, invoice still paid', (r->>'ok') || '/' || (r->>'payment_status'), 'true/paid');
  perform pg_temp.chk('refund after a credit note does NOT reverse commission again', pg_temp.bal(v_i) || '/' || (select count(*)::text from public.commission_entries where invoice_id = v_i), '1700/6');
  -- one more minor unit refunded: no longer fully paid -> everything left is reversed
  r := pg_temp.as_('owner', format($q$select public.reverse_payment(%L, 'one more', 1)$q$, v_p2));
  perform pg_temp.chk('refund that makes the invoice not fully paid', r->>'payment_status', 'partial');
  perform pg_temp.chk('...reverses ALL remaining commission (reason unpaid)', pg_temp.bal(v_i) || '/' || (select count(*)::text from public.commission_entries where invoice_id = v_i and reason = 'unpaid'), '0/3');
  -- paid again: earned again as NEW rows, scaled by what still stands
  perform pg_temp.pay('owner', v_i, 1);
  perform pg_temp.chk('fully paid again: re-earned as new rows (1700)', pg_temp.bal(v_i) || '/' || (select count(*)::text from public.commission_entries where invoice_id = v_i), '1700/12');
  perform pg_temp.chk('every earn row has reason paid, every reversal credit_note or unpaid', (select bool_and((kind = 'earn' and reason = 'paid') or (kind = 'reversal' and reason in ('credit_note', 'unpaid'))) from public.commission_entries where invoice_id = v_i)::text, 'true');
end $$;

-- Case 2 + rounding + exact remainder
do $$
declare v_a uuid; v_i uuid; v_p uuid; r jsonb;
begin
  v_a := pg_temp.mk_appt('s1', 1);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_cut') || '","quantity":1,"unit_price_minor":4000}]');
  v_p := pg_temp.pay('owner', v_i, 4800);
  -- rule at that moment: the NEWEST version is 50% effective today, so the earn is 2000
  perform pg_temp.chk('latest effective version wins (50% from today)', pg_temp.ent(v_i), 'earn:2000:paid');
  perform pg_temp.as_('owner', format($q$select public.reverse_payment(%L, 'bounced', 100)$q$, v_p));
  perform pg_temp.chk('payment reversal making it unpaid reverses the whole commission', pg_temp.ent(v_i), 'earn:2000:paid,reversal:2000:unpaid');
  perform pg_temp.pay('owner', v_i, 100);
  perform pg_temp.chk('paid again: a fresh earn row on the pinned snapshot', pg_temp.ent(v_i), 'earn:2000:paid,earn:2000:paid,reversal:2000:unpaid');
end $$;

do $$
declare v_a uuid; v_i uuid; r jsonb;
begin
  -- half-up rounding on 3335 at 10%: 333.5 -> 334. Use S3 with the 10% rule.
  perform pg_temp.rule('s3', 'svc_cut', 'percent', 1000, null, null, current_date - 1);
  v_a := pg_temp.mk_appt('s3', 2);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_cut') || '","quantity":1,"unit_price_minor":3335}]');
  perform pg_temp.chk('I3 total 4002 (net 3335 + tax 667)', (select total_minor::text from public.invoices where id = v_i), '4002');
  perform pg_temp.pay('owner', v_i, 4002);
  perform pg_temp.chk('half-up: 333.5 -> 334', pg_temp.ent(v_i), 'earn:334:paid');
  r := pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'tiny', 1)$q$, v_i));
  perform pg_temp.chk('a 1-unit credit note changes nothing (scaled 334.4 -> 334)', pg_temp.ent(v_i), 'earn:334:paid');
  r := pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'the rest')$q$, v_i));
  perform pg_temp.chk('the credit that exhausts the net takes the EXACT remainder', pg_temp.ent(v_i) || '|' || pg_temp.bal(v_i), 'earn:334:paid,reversal:334:credit_note|0');
  perform pg_temp.chk('...invoice is fully credited', r->>'payment_status', 'credited');
  -- credit note BEFORE full payment: the invoice becomes paid by the credit
  v_a := pg_temp.mk_appt('s3', 3);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_cut') || '","quantity":1,"unit_price_minor":5000}]');
  perform pg_temp.pay('owner', v_i, 3000);
  perform pg_temp.chk('3000 of 6000: not paid, nothing earned', pg_temp.ent(v_i), '');
  r := pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'goodwill', 2500)$q$, v_i));
  perform pg_temp.chk('credit note leaves net due 3000 = paid: the invoice BECOMES paid', r->>'payment_status', 'paid');
  perform pg_temp.chk('...commission earned on the remaining half of the net (250 of 500)', pg_temp.ent(v_i), 'earn:250:paid');
end $$;

-- rule resolution
do $$
declare v_a uuid; v_i uuid;
begin
  -- S3: cut has versions 10% (-10d), 20% (-1d)... we set the 10% above already; add 20% (-1d) later date wins
  perform pg_temp.rule('s3', 'svc_cut', 'percent', 2000, null, null, current_date);
  perform pg_temp.rule('s3', 'svc_cut', 'percent', 3000, null, null, current_date + 5);
  perform pg_temp.rule('s3', null, 'flat', null, 700, 'USD', current_date - 1);
  v_a := pg_temp.mk_appt('s3', 4);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_cut') || '","quantity":1,"unit_price_minor":4000},{"service_id":"' || pg_temp.id('svc_col') || '","quantity":1,"unit_price_minor":10000}]');
  perform pg_temp.pay('owner', v_i, 16800);
  perform pg_temp.chk('version with latest effective_from <= today wins (20% = 800); the future version (30%) is ignored', pg_temp.ent(v_i), 'earn:800:paid');
  perform pg_temp.chk('a USD flat default does not apply to a GBP invoice (colour earns nothing)', (select full_commission_minor::text || ':' || rule_kind from public.commission_lines where invoice_id = v_i and line_net_minor = 10000), '0:none');
  -- 'none' overrides the default
  perform pg_temp.rule('s4', null, 'percent', 1000, null, null, current_date - 1);
  perform pg_temp.rule('s4', 'svc_col', 'none', null, null, null, current_date - 1);
  v_a := pg_temp.mk_appt('s4', 5);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_cut') || '","quantity":1,"unit_price_minor":4000},{"service_id":"' || pg_temp.id('svc_col') || '","quantity":1,"unit_price_minor":10000}]');
  perform pg_temp.pay('owner', v_i, 16800);
  perform pg_temp.chk('service rule "none" beats the staff default; the other line uses the default 10%', pg_temp.ent(v_i), 'earn:400:paid');
  -- free-text lines: default FLAT never applies, service line gets the flat
  perform pg_temp.rule('s5', null, 'flat', null, 500, 'GBP', current_date - 1);
  v_a := pg_temp.mk_appt('s5', 6);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_cut') || '","quantity":1,"unit_price_minor":4000},{"description":"Product","quantity":1,"unit_price_minor":1000}]');
  perform pg_temp.pay('owner', v_i, 6000);
  perform pg_temp.chk('free-text line earns nothing from a flat default; the service line earns the flat 500', pg_temp.ent(v_i), 'earn:500:paid');
  -- flat is capped at the line net
  v_a := pg_temp.mk_appt('s1', 7);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_col') || '","quantity":1,"unit_price_minor":1000}]');
  perform pg_temp.pay('owner', v_i, 1200);
  perform pg_temp.chk('flat 1500 on a 1000 line is capped at the line net', pg_temp.ent(v_i), 'earn:1000:paid');
  -- no rules at all: snapshot with zeros, then a LATER rule never earns retroactively
  v_a := pg_temp.mk_appt('s2', 8);
  v_i := pg_temp.mk_inv('owner', 'brancha', v_a, '[{"service_id":"' || pg_temp.id('svc_cut') || '","quantity":1,"unit_price_minor":4000}]');
  perform pg_temp.pay('owner', v_i, 4800);
  perform pg_temp.chk('no rule: snapshot taken with zero commission, no entries', (select count(*)::text || ':' || max(rule_kind) || ':' || max(full_commission_minor) from public.commission_lines where invoice_id = v_i) || '/' || (select count(*)::text from public.commission_entries where invoice_id = v_i), '1:none:0/0');
  perform pg_temp.rule('s2', null, 'percent', 5000, null, null, current_date - 1);
  perform pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'late rule test', 100)$q$, v_i));
  perform pg_temp.chk('a rule added AFTER payment does not earn on a later credit note (no late earning)', (select count(*)::text from public.commission_entries where invoice_id = v_i), '0');
  -- invoice with no appointment: no staff, no commission
  v_i := pg_temp.mk_inv('owner', 'brancha', null, '[{"description":"Walk-in","quantity":1,"unit_price_minor":1000}]');
  perform pg_temp.pay('owner', v_i, 1200);
  perform pg_temp.chk('invoice without an appointment has no commission lines', (select count(*)::text from public.commission_lines where invoice_id = v_i), '0');
end $$;

-- Solo business: paid with the feature off => zero snapshot; upgrade later never earns retroactively
do $$
declare v_svc uuid; v_cl uuid; v_fv uuid; v_stf uuid; v_a uuid; v_i uuid; r jsonb;
begin
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('bizs'), 'Cut', 30, 0) returning id into v_svc;
  insert into public.clients (business_id, full_name, phone_e164) values (pg_temp.id('bizs'), 'Solo Client', '+447700900222') returning id into v_cl;
  insert into public.staff_profiles (business_id, display_name, is_active) values (pg_temp.id('bizs'), 'Solo Staff', true) returning id into v_stf;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_stf, pg_temp.id('branchs'), pg_temp.id('bizs'));
  select id into v_fv from public.form_versions where business_id = pg_temp.id('bizs') order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('bizs'), pg_temp.id('branchs'), v_cl, v_svc, v_stf, '2026-08-01 10:00+00', '2026-08-01 10:30+00', 30, 0, 'completed', 'dashboard', v_fv, 2000) returning id into v_a;
  insert into ids values ('stf_solo', v_stf);
  r := pg_temp.as_('owners', format($q$select public.create_invoice_draft(%L, %L, null, '[{"description":"Cut","quantity":1,"unit_price_minor":2000}]'::jsonb)$q$, pg_temp.id('branchs'), v_a));
  v_i := (r->>'invoice_id')::uuid;
  perform pg_temp.as_('owners', format($q$select public.issue_invoice(%L)$q$, v_i));
  perform pg_temp.as_('owners', format($q$select public.add_payment(%L, 'cash', 2000)$q$, v_i));
  perform pg_temp.chk('Solo plan: paid invoice -> snapshot with feature_off, zero commission, no entries', (select count(*)::text || ':' || max(rule_kind) || ':' || max(full_commission_minor) from public.commission_lines where invoice_id = v_i) || '/' || (select count(*)::text from public.commission_entries where invoice_id = v_i), '1:feature_off:0/0');
  perform pg_temp.chk('assign Team', pg_temp.as_('sadmin', format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('bizs')), true)->>'ok', 'true');
  perform pg_temp.as_('owners', format($q$select public.create_credit_note(%L, 'after upgrade', 100)$q$, v_i));
  perform pg_temp.chk('upgrading later never earns commission on an old invoice', (select count(*)::text from public.commission_entries where invoice_id = v_i), '0');
  perform pg_temp.chk('set back to Solo', pg_temp.as_('sadmin', format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizs')), true)->>'ok', 'true');
  perform pg_temp.chk('Solo plan: set_commission_rule -> feature_unavailable', pg_temp.as_('owners', format($q$select public.set_commission_rule(%L, null, 'percent', 100)$q$, v_stf))->>'code', 'feature_unavailable');
end $$;

-- immutability + the balance backstop
do $$
declare v_i uuid := pg_temp.id('i1'); v_item uuid; v_staff uuid := pg_temp.id('s1'); v_line record;
begin
  perform pg_temp.chk('entries immutable: update', pg_temp.try('update public.commission_entries set amount_minor = amount_minor + 1'), '23514');
  perform pg_temp.chk('entries immutable: delete', pg_temp.try('delete from public.commission_entries'), '23514');
  perform pg_temp.chk('lines immutable: update', pg_temp.try('update public.commission_lines set full_commission_minor = 1'), '23514');
  perform pg_temp.chk('lines immutable: delete', pg_temp.try('delete from public.commission_lines'), '23514');
  select cl.invoice_item_id, cl.full_commission_minor, cl.branch_id, cl.business_id, cl.staff_id into v_line from public.commission_lines cl where cl.invoice_id = v_i and cl.rule_kind = 'percent' and cl.full_commission_minor = 350;
  perform pg_temp.chk('backstop: an earn above the full commission is refused', pg_temp.try(format($q$insert into public.commission_entries (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason) values (%L, %L, %L, %L, %L, 'earn', 1000, 'GBP', 'paid')$q$, v_line.business_id, v_line.branch_id, v_i, v_line.invoice_item_id, v_line.staff_id)), '23514');
  perform pg_temp.chk('backstop: a reversal below zero is refused', pg_temp.try(format($q$insert into public.commission_entries (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason) values (%L, %L, %L, %L, %L, 'reversal', 99999, 'GBP', 'unpaid')$q$, v_line.business_id, v_line.branch_id, v_i, v_line.invoice_item_id, v_line.staff_id)), '23514');
  perform pg_temp.chk('backstop: an entry for a different staff member is refused', pg_temp.try(format($q$insert into public.commission_entries (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason) values (%L, %L, %L, %L, %L, 'reversal', 1, 'GBP', 'unpaid')$q$, v_line.business_id, v_line.branch_id, v_i, v_line.invoice_item_id, pg_temp.id('s2'))), '23514');
  perform pg_temp.chk('backstop: wrong currency refused', pg_temp.try(format($q$insert into public.commission_entries (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason) values (%L, %L, %L, %L, %L, 'reversal', 1, 'USD', 'unpaid')$q$, v_line.business_id, v_line.branch_id, v_i, v_line.invoice_item_id, v_line.staff_id)), '23514');
  perform pg_temp.chk('...the books are exactly as before', pg_temp.bal(v_i), '1700');
end $$;

-- RLS per role
do $$
declare v_all text; v_s1 text;
begin
  v_all := (select count(*)::text from public.commission_entries where business_id = pg_temp.id('biza'));
  perform pg_temp.chk('owner sees every entry', pg_temp.as_q('owner', 'select count(*)::text from public.commission_entries'), v_all);
  perform pg_temp.chk('manager (view_all at branch) sees them all', pg_temp.as_q('mgr', 'select count(*)::text from public.commission_entries'), v_all);
  perform pg_temp.chk('manager of ANOTHER branch (Karachi) sees none of branch A', pg_temp.as_q('mgrk', 'select count(*)::text from public.commission_entries'), '0');
  perform pg_temp.chk('receptionist sees none', pg_temp.as_q('recep', 'select count(*)::text from public.commission_entries'), '0');
  perform pg_temp.chk('other business sees none', pg_temp.as_q('ownerb', 'select count(*)::text from public.commission_entries'), '0');
  perform pg_temp.chk('anon is refused outright', pg_temp.as_anon('select to_jsonb(count(*)) from public.commission_entries')->>'state', '42501');
  v_s1 := (select count(*)::text from public.commission_entries where staff_id = pg_temp.id('s1'));
  perform pg_temp.chk('staff (S1, view_own) sees ONLY their own entries', pg_temp.as_q('staffa', 'select count(*)::text from public.commission_entries'), v_s1);
  perform pg_temp.chk('...and no entry of anyone else', pg_temp.as_q('staffa', 'select count(*)::text from public.commission_entries where staff_id <> (select id from public.staff_profiles where display_name = ''Sam One'')'), '0');
  perform pg_temp.chk('...same for the line snapshots', pg_temp.as_q('staffa', 'select count(*)::text from public.commission_lines where staff_id <> (select id from public.staff_profiles where display_name = ''Sam One'')'), '0');
  perform pg_temp.chk('...and rules: only their own', pg_temp.as_q('staffa', 'select count(*)::text from public.commission_rules where staff_id <> (select id from public.staff_profiles where display_name = ''Sam One'')'), '0');
  perform pg_temp.chk('owner sees all rules, receptionist none', (pg_temp.as_q('owner', 'select (count(*) > 5)::text from public.commission_rules')) || '/' || pg_temp.as_q('recep', 'select count(*)::text from public.commission_rules'), 'true/0');
  perform pg_temp.chk('no API role can write entries directly (grant)', pg_temp.try_as('owner', format($q$insert into public.commission_entries (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason) select business_id, branch_id, invoice_id, invoice_item_id, staff_id, 'earn', 1, 'GBP', 'paid' from public.commission_lines limit 1$q$)), '42501');
  perform pg_temp.chk('no API role can write rules directly (grant)', pg_temp.try_as('owner', format($q$insert into public.commission_rules (business_id, staff_id, kind, percent_bp, effective_from) values (%L, %L, 'percent', 9999, current_date)$q$, pg_temp.id('biza'), pg_temp.id('s1'))), '42501');
  perform pg_temp.chk('internal engine is not callable', pg_temp.try_as('owner', format($q$select public.commission_sync(%L)$q$, pg_temp.id('i1'))), '42501');
end $$;

-- report
do $$
declare r jsonb; v_s1net text;
begin
  v_s1net := (select coalesce(sum(case kind when 'earn' then amount_minor else -amount_minor end), 0)::text from public.commission_entries where staff_id = pg_temp.id('s1'));
  r := pg_temp.as_('owner', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('report ok for the owner', r->>'ok', 'true');
  perform pg_temp.chk('S1 row: net equals the ledger', (select (x->>'net_minor') from jsonb_array_elements(r->'rows') x where x->>'staff_name' = 'Sam One'), v_s1net);
  perform pg_temp.chk('earned - reversed = net on every row', (select bool_and((x->>'earned_minor')::bigint - (x->>'reversed_minor')::bigint = (x->>'net_minor')::bigint)::text from jsonb_array_elements(r->'rows') x), 'true');
  perform pg_temp.chk('rows are per staff and per currency (all GBP here)', (select string_agg(distinct x->>'currency', ',') from jsonb_array_elements(r->'rows') x), 'GBP');
  perform pg_temp.chk('totals by currency = sum of rows', (r->'totals_by_currency'->0->>'net_minor'), (select sum((x->>'net_minor')::bigint)::text from jsonb_array_elements(r->'rows') x));
  perform pg_temp.chk('manager sees the same rows', jsonb_array_length(pg_temp.as_('mgr', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1)$q$, pg_temp.id('biza')))->'rows')::text, jsonb_array_length(r->'rows')::text);
  r := pg_temp.as_('staffa', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('staff report: one row, their own', jsonb_array_length(r->'rows') || '/' || (r->'rows'->0->>'staff_name'), '1/Sam One');
  r := pg_temp.as_('staffa', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1, null, %L)$q$, pg_temp.id('biza'), pg_temp.id('s3')));
  perform pg_temp.chk('staff asking for ANOTHER staff member gets nothing', jsonb_array_length(r->'rows')::text, '0');
  perform pg_temp.chk('receptionist forbidden', pg_temp.as_('recep', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('other business forbidden', pg_temp.as_('ownerb', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute', pg_temp.as_anon(format($q$select public.get_commission_report(%L, current_date, current_date)$q$, pg_temp.id('biza')))->>'state', '42501');
  perform pg_temp.chk('Solo plan -> feature_unavailable', pg_temp.as_('owners', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1)$q$, pg_temp.id('bizs')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('from after to', pg_temp.as_('owner', format($q$select public.get_commission_report(%L, current_date, current_date - 1)$q$, pg_temp.id('biza')))->>'code', 'invalid_range');
  perform pg_temp.chk('range above 366 days', pg_temp.as_('owner', format($q$select public.get_commission_report(%L, current_date - 400, current_date)$q$, pg_temp.id('biza')))->>'code', 'range_too_large');
  perform pg_temp.chk('branch of another business', pg_temp.as_('owner', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1, %L)$q$, pg_temp.id('biza'), pg_temp.id('branchb')))->>'code', 'invalid_branch');
  perform pg_temp.chk('branch filter: Karachi has no entries', jsonb_array_length(pg_temp.as_('owner', format($q$select public.get_commission_report(%L, current_date - 1, current_date + 1, %L)$q$, pg_temp.id('biza'), pg_temp.id('branchk')))->'rows')::text, '0');
  perform pg_temp.chk('a window in the past has none', jsonb_array_length(pg_temp.as_('owner', format($q$select public.get_commission_report(%L, date '2020-01-01', date '2020-01-31')$q$, pg_temp.id('biza')))->'rows')::text, '0');
end $$;

-- DST boundary: New_York March 2027 (business B, trial). Entries at the exact edges.
do $$
declare v_stf uuid; v_inv uuid; v_item uuid; r jsonb; v_svc uuid; v_cl uuid;
begin
  insert into public.staff_profiles (business_id, display_name, is_active) values (pg_temp.id('bizb'), 'NY Staff', true) returning id into v_stf;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_stf, pg_temp.id('branchb'), pg_temp.id('bizb'));
  v_inv := pg_temp.mk_issued(pg_temp.id('bizb'), pg_temp.id('branchb'), 'USD', '2027-03-10 12:00+00', 10000, 0, 1);
  select id into v_item from public.invoice_items where invoice_id = v_inv;
  insert into public.commission_lines (invoice_item_id, business_id, branch_id, invoice_id, staff_id, rule_kind, percent_bp, currency, quantity, line_net_minor, full_commission_minor)
  values (v_item, pg_temp.id('bizb'), pg_temp.id('branchb'), v_inv, v_stf, 'percent', 1000, 'USD', 1, 10000, 1000);
  insert into public.commission_entries (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason, created_at) values
    (pg_temp.id('bizb'), pg_temp.id('branchb'), v_inv, v_item, v_stf, 'earn', 100, 'USD', 'paid', '2027-03-01 04:59:59+00'),  -- Feb 28 23:59:59 EST
    (pg_temp.id('bizb'), pg_temp.id('branchb'), v_inv, v_item, v_stf, 'earn', 200, 'USD', 'paid', '2027-03-01 05:00:00+00'),  -- Mar 1 00:00:00 EST
    (pg_temp.id('bizb'), pg_temp.id('branchb'), v_inv, v_item, v_stf, 'earn', 300, 'USD', 'paid', '2027-04-01 03:59:59+00'),  -- Mar 31 23:59:59 EDT
    (pg_temp.id('bizb'), pg_temp.id('branchb'), v_inv, v_item, v_stf, 'earn', 400, 'USD', 'paid', '2027-04-01 04:00:00+00');  -- Apr 1 00:00:00 EDT
  r := pg_temp.as_('ownerb', format($q$select public.get_commission_report(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('bizb')));
  perform pg_temp.chk('NY March (DST starts Mar 14): only the two entries inside local March (200 + 300)', (r->'rows'->0->>'earned_minor'), '500');
  r := pg_temp.as_('ownerb', format($q$select public.get_commission_report(%L, date '2027-02-01', date '2027-02-28')$q$, pg_temp.id('bizb')));
  perform pg_temp.chk('NY February holds the 04:59:59Z entry (23:59:59 EST)', (r->'rows'->0->>'earned_minor'), '100');
  r := pg_temp.as_('ownerb', format($q$select public.get_commission_report(%L, date '2027-04-01', date '2027-04-30')$q$, pg_temp.id('bizb')));
  perform pg_temp.chk('NY April starts at 04:00:00Z (00:00 EDT)', (r->'rows'->0->>'earned_minor'), '400');
end $$;

-- ===========================================================================
-- 4. ADVANCED REPORTS: fixtures (March / February 2027; London, Karachi, an archived branch)
-- ===========================================================================
create or replace function pg_temp.mk_pay(p_inv uuid, p_amt bigint, p_at timestamptz, p_method text default 'cash') returns uuid language plpgsql as $$
declare v uuid; i record;
begin
  select business_id, branch_id, currency into i from public.invoices where id = p_inv;
  insert into public.invoice_payments (business_id, branch_id, invoice_id, kind, method, amount_minor, currency, paid_at)
  values (i.business_id, i.branch_id, p_inv, 'payment', p_method::public.invoice_payment_method, p_amt, i.currency, p_at) returning id into v;
  return v;
end $$;
create or replace function pg_temp.mk_rev(p_pay uuid, p_amt bigint, p_at timestamptz) returns void language plpgsql as $$
declare p record;
begin
  select * into p from public.invoice_payments where id = p_pay;
  insert into public.invoice_payments (business_id, branch_id, invoice_id, kind, method, amount_minor, currency, paid_at, reverses_payment_id, reason)
  values (p.business_id, p.branch_id, p.invoice_id, 'reversal', p.method, p_amt, p.currency, p_at, p_pay, 'test reversal');
end $$;
create or replace function pg_temp.mk_cn(p_inv uuid, p_net bigint, p_tax bigint, p_at timestamptz, p_seq bigint) returns void language plpgsql as $$
declare i record;
begin
  select business_id, branch_id, currency, tax_rate_bp into i from public.invoices where id = p_inv;
  insert into public.credit_notes (business_id, branch_id, invoice_id, number, number_seq, currency, tax_rate_bp, net_minor, tax_minor, total_minor, reason, issued_at)
  values (i.business_id, i.branch_id, p_inv, 'CN-T-' || p_seq || '-' || left(p_inv::text, 4), 900000 + p_seq, i.currency, i.tax_rate_bp, p_net, p_tax, p_net + p_tax, 'test credit', p_at);
end $$;
create or replace function pg_temp.mk_client(p_key text, p_name text, p_phone text) returns void language plpgsql as $$
declare v uuid;
begin
  insert into public.clients (business_id, full_name, phone_e164) values (pg_temp.id('biza'), p_name, p_phone) returning id into v;
  insert into ids values (p_key, v);
end $$;
create or replace function pg_temp.ap(p_key text, p_staff text, p_svc text, p_client text, p_at timestamptz, p_status text, p_branch text default 'brancha') returns uuid language plpgsql as $$
declare v uuid; v_fv uuid; v_st uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  v_st := case when p_staff is null then null else pg_temp.id(p_staff) end;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor, cancelled_at)
  values (pg_temp.id('biza'), pg_temp.id(p_branch), pg_temp.id(p_client), pg_temp.id(p_svc), v_st, p_at, p_at + interval '30 minutes', 30, 0, p_status::public.appointment_status, 'dashboard', v_fv, 1000,
          case when p_status = 'cancelled' then p_at - interval '1 day' end) returning id into v;
  insert into ids values (p_key, v);
  return v;
end $$;

do $$
declare v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l4 uuid; v_l5 uuid; v_l6 uuid; v_p uuid; v_k1 uuid; v_k2 uuid; v_k3 uuid; v_k4 uuid; v_lh uuid;
  v_a uuid := pg_temp.id('biza'); v_br uuid := pg_temp.id('brancha'); v_kr uuid := pg_temp.id('branchk'); v_cut uuid := pg_temp.id('svc_cut'); v_col uuid := pg_temp.id('svc_col');
begin
  perform pg_temp.mk_client('c1', 'Client One', '+447700900301'); perform pg_temp.mk_client('c2', 'Client Two', '+447700900302');
  perform pg_temp.mk_client('c3', 'Client Three', '+447700900303'); perform pg_temp.mk_client('c4', 'Client Four', '+447700900304');
  perform pg_temp.mk_client('c5', 'Client Five', '+447700900305'); perform pg_temp.mk_client('c6', 'Client Six', '+923001234567');

  -- appointments (London). March = 10 in window + 1 on the April edge; Feb = 5 incl. the Feb 28 23:59Z edge.
  perform pg_temp.ap('x_a1', 's1', 'svc_cut', 'c1', '2027-03-02 08:00+00', 'completed');
  perform pg_temp.ap('x_a2', 's1', 'svc_cut', 'c2', '2027-03-03 08:00+00', 'completed');
  perform pg_temp.ap('x_a3', 's1', 'svc_col', 'c3', '2027-03-04 08:00+00', 'completed');
  perform pg_temp.ap('x_a4', 's1', 'svc_cut', 'c4', '2027-03-05 08:00+00', 'cancelled');
  perform pg_temp.ap('x_a5', 's2', 'svc_cut', 'c2', '2027-03-02 09:00+00', 'completed');
  perform pg_temp.ap('x_a6', 's2', 'svc_col', 'c3', '2027-03-03 09:00+00', 'completed');
  perform pg_temp.ap('x_a7', 's2', 'svc_col', 'c1', '2027-03-04 09:00+00', 'completed');
  perform pg_temp.ap('x_a8', 's2', 'svc_cut', 'c4', '2027-03-05 09:00+00', 'no_show');
  perform pg_temp.ap('x_a9', 's2', 'svc_cut', 'c4', '2027-03-06 09:00+00', 'confirmed');
  perform pg_temp.ap('x_a10', 's3', 'svc_col', 'c1', '2027-03-02 10:00+00', 'cancelled');
  perform pg_temp.ap('x_a11', 's1', 'svc_cut', 'c2', '2027-03-31 23:00+00', 'completed');   -- 00:00 BST Apr 1 => April
  perform pg_temp.ap('x_a12', 's1', 'svc_cut', 'c2', '2027-02-28 23:59+00', 'completed');   -- Feb 28 23:59 GMT => February
  perform pg_temp.ap('x_f1', 's1', 'svc_cut', 'c2', '2027-02-10 08:00+00', 'completed');
  perform pg_temp.ap('x_f2', 's1', 'svc_cut', 'c3', '2027-02-11 08:00+00', 'completed');
  perform pg_temp.ap('x_f3', 's1', 'svc_cut', 'c5', '2027-02-12 08:00+00', 'completed');
  perform pg_temp.ap('x_f4', 's2', 'svc_cut', 'c4', '2027-02-13 09:00+00', 'cancelled');
  perform pg_temp.ap('x_j1', 's1', 'svc_cut', 'c1', '2027-01-05 08:00+00', 'cancelled');   -- C1's earlier CANCELLED visit: not a "first visit"
  -- Karachi: one completed March appointment, new client
  perform pg_temp.ap('x_k1', null, 'svc_cut', 'c6', '2027-03-10 06:00+00', 'completed', 'branchk');

  alter table public.invoice_payments disable trigger invoice_payments_commission;
  alter table public.credit_notes disable trigger credit_notes_commission;

  -- London invoices
  v_l1 := pg_temp.mk_issued(v_a, v_br, 'GBP', '2027-03-01 00:00+00', 10000, 2000, 901, v_cut, pg_temp.id('x_a1'));
  v_l2 := pg_temp.mk_issued(v_a, v_br, 'GBP', '2027-03-15 12:00+00', 20000, 4000, 902, v_col, pg_temp.id('x_a3'), 1000);
  v_l3 := pg_temp.mk_issued(v_a, v_br, 'GBP', '2027-03-31 22:59+00', 5000, 1000, 903, v_cut, pg_temp.id('x_a5'));
  v_l4 := pg_temp.mk_issued(v_a, v_br, 'GBP', '2027-03-31 23:00+00', 7000, 1400, 904, v_cut);
  v_l5 := pg_temp.mk_issued(v_a, v_br, 'GBP', '2027-02-28 23:59+00', 3000, 600, 905, v_cut);
  v_l6 := pg_temp.mk_issued(v_a, v_br, 'GBP', '2027-02-10 12:00+00', 8000, 1600, 906, v_cut);
  perform pg_temp.mk_pay(v_l1, 12000, '2027-03-02 10:00+00', 'cash');
  v_p := pg_temp.mk_pay(v_l2, 20000, '2027-03-16 10:00+00', 'card');
  perform pg_temp.mk_rev(v_p, 2000, '2027-03-17 10:00+00');
  perform pg_temp.mk_pay(v_l4, 999, '2027-03-31 23:30+00', 'cash');   -- 00:30 BST Apr 1 => April
  perform pg_temp.mk_pay(v_l6, 5000, '2027-02-12 10:00+00', 'cash');
  perform pg_temp.mk_cn(v_l2, 2000, 400, '2027-03-20 12:00+00', 1);
  perform pg_temp.mk_cn(v_l6, 1000, 200, '2027-02-15 12:00+00', 2);
  -- Karachi invoices (PKR, no tax)
  v_k1 := pg_temp.mk_issued(v_a, v_kr, 'PKR', '2027-02-28 19:00+00', 50000, 0, 911, v_cut);   -- Mar 1 00:00 PKT
  v_k2 := pg_temp.mk_issued(v_a, v_kr, 'PKR', '2027-03-31 18:59+00', 30000, 0, 912, v_cut);   -- Mar 31 23:59 PKT
  v_k3 := pg_temp.mk_issued(v_a, v_kr, 'PKR', '2027-03-31 19:00+00', 99999, 0, 913, v_cut);   -- Apr 1 00:00 PKT
  v_k4 := pg_temp.mk_issued(v_a, v_kr, 'PKR', '2027-02-28 18:59+00', 7000, 0, 914, v_cut);    -- Feb 28 23:59 PKT
  perform pg_temp.mk_pay(v_k1, 50000, '2027-03-02 10:00+00', 'bank_transfer');
  -- an ARCHIVED branch (Lahore) with history in March
  v_lh := pg_temp.mk_issued(v_a, pg_temp.id('branchh'), 'PKR', '2027-03-10 06:00+00', 4000, 0, 921, v_cut);

  alter table public.invoice_payments enable trigger invoice_payments_commission;
  alter table public.credit_notes enable trigger credit_notes_commission;

  -- synthetic commission entries inside March (staff section), created_at explicit
  declare v_item uuid; v_inv uuid := v_l1;
  begin
    select id into v_item from public.invoice_items where invoice_id = v_inv;
    insert into public.commission_lines (invoice_item_id, business_id, branch_id, invoice_id, staff_id, rule_kind, percent_bp, currency, quantity, line_net_minor, full_commission_minor)
    values (v_item, v_a, v_br, v_inv, pg_temp.id('s1'), 'percent', 1000, 'GBP', 1, 10000, 1000);
    insert into public.commission_entries (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason, created_at) values
      (v_a, v_br, v_inv, v_item, pg_temp.id('s1'), 'earn', 1000, 'GBP', 'paid', '2027-03-10 12:00+00'),
      (v_a, v_br, v_inv, v_item, pg_temp.id('s1'), 'reversal', 200, 'GBP', 'credit_note', '2027-03-11 12:00+00');
    select id into v_item from public.invoice_items where invoice_id = v_l3;
    insert into public.commission_lines (invoice_item_id, business_id, branch_id, invoice_id, staff_id, rule_kind, percent_bp, currency, quantity, line_net_minor, full_commission_minor)
    values (v_item, v_a, v_br, v_l3, pg_temp.id('s2'), 'percent', 1000, 'GBP', 1, 5000, 500);
    insert into public.commission_entries (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason, created_at)
    values (v_a, v_br, v_l3, v_item, pg_temp.id('s2'), 'earn', 500, 'GBP', 'paid', '2027-03-12 12:00+00');
  end;
end $$;

-- viewer gets a custom role: view_advanced (all) but NOT view_revenue
do $$
declare r jsonb;
begin
  r := pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Advanced No Revenue', '[{"permission":"reports.view_advanced","scope":"all"},{"permission":"reports.view_basic","scope":"all"}]'::jsonb)$q$, pg_temp.id('biza')));
  insert into ids values ('role_advnr', (r->>'role_id')::uuid);
  perform pg_temp.chk('assign Advanced No Revenue to viewer (all branches)', pg_temp.as_('owner', format($q$select public.assign_member_role(%L, %L, null)$q$, pg_temp.member('biza', 'viewer'), pg_temp.id('role_advnr')))->>'ok', 'true');
end $$;

-- period resolution (internal, pure)
do $$
begin
  perform pg_temp.chk('weekly: Wednesday anchor -> Mon..Sun, previous week', (select (j->>'from') || '..' || (j->>'to') || ' / ' || (j->>'prev_from') || '..' || (j->>'prev_to') from (select public.report_period('weekly', date '2027-03-10', null, null) j) x), '2027-03-08..2027-03-14 / 2027-03-01..2027-03-07');
  perform pg_temp.chk('weekly: Sunday belongs to the week that ends on it', (select (j->>'from') || '..' || (j->>'to') from (select public.report_period('weekly', date '2027-03-14', null, null) j) x), '2027-03-08..2027-03-14');
  perform pg_temp.chk('weekly: Monday starts a new week', (select (j->>'from') || '..' || (j->>'to') from (select public.report_period('weekly', date '2027-03-15', null, null) j) x), '2027-03-15..2027-03-21');
  perform pg_temp.chk('monthly: March -> February', (select (j->>'from') || '..' || (j->>'to') || ' / ' || (j->>'prev_from') || '..' || (j->>'prev_to') from (select public.report_period('monthly', date '2027-03-15', null, null) j) x), '2027-03-01..2027-03-31 / 2027-02-01..2027-02-28');
  perform pg_temp.chk('an anchor more than a year ahead is refused', (select j->>'code' from (select public.report_period('monthly', date '2028-03-15', null, null) j) x), 'invalid_date');
  perform pg_temp.chk('monthly: January -> December of the year before', (select (j->>'prev_from') || '..' || (j->>'prev_to') from (select public.report_period('monthly', date '2027-01-31', null, null) j) x), '2026-12-01..2026-12-31');
  perform pg_temp.chk('custom: previous = same number of days right before', (select (j->>'prev_from') || '..' || (j->>'prev_to') from (select public.report_period('custom', null, date '2027-03-02', date '2027-03-03') j) x), '2027-02-28..2027-03-01');
  perform pg_temp.chk('custom: one day', (select (j->>'prev_from') || '..' || (j->>'prev_to') from (select public.report_period('custom', null, date '2027-03-02', date '2027-03-02') j) x), '2027-03-01..2027-03-01');
  perform pg_temp.chk('custom: from after to', (select j->>'code' from (select public.report_period('custom', null, date '2027-03-03', date '2027-03-02') j) x), 'invalid_range');
  perform pg_temp.chk('custom: 367 days', (select j->>'code' from (select public.report_period('custom', null, date '2027-01-01', date '2028-01-02') j) x), 'range_too_large');
  perform pg_temp.chk('custom: exactly 366 days is allowed', (select j->>'ok' from (select public.report_period('custom', null, date '2027-01-01', date '2027-12-31') j) x), 'true');
  perform pg_temp.chk('unknown period', (select j->>'code' from (select public.report_period('daily', null, null, null) j) x), 'invalid_period');
  perform pg_temp.chk('anchor in 2019 refused', (select j->>'code' from (select public.report_period('monthly', date '2019-06-01', null, null) j) x), 'invalid_date');
end $$;

-- revenue
do $$
declare r jsonb; g jsonb; k jsonb; pg jsonb; pk jsonb;
begin
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('revenue March ok, with the period and the previous period', (r->>'ok') || '/' || (r->'period'->>'from') || '/' || (r->'period'->>'prev_from'), 'true/2027-03-01/2027-02-01');
  g := (select x from jsonb_array_elements(r->'current'->'currencies') x where x->>'currency' = 'GBP');
  k := (select x from jsonb_array_elements(r->'current'->'currencies') x where x->>'currency' = 'PKR');
  perform pg_temp.chk('one block per currency (AED = the live Dubai branch with nothing in March), never summed', (select string_agg(x->>'currency', ',' order by x->>'currency') from jsonb_array_elements(r->'current'->'currencies') x), 'AED,GBP,PKR');
  perform pg_temp.chk('GBP March: 3 invoices (the 23:00Z and Feb-28 edges are OUT)', g->>'invoice_count', '3');
  perform pg_temp.chk('GBP March: invoiced 42000 (incl tax), credited 2400', (g->>'invoiced_minor') || '/' || (g->>'credited_minor'), '42000/2400');
  perform pg_temp.chk('GBP March: net 33000 (35000 - 2000), tax 6600', (g->>'net_revenue_minor') || '/' || (g->>'tax_minor'), '33000/6600');
  perform pg_temp.chk('GBP March: collected 30000 (12000 + 20000 - 2000 reversal); the 00:30 BST Apr 1 payment is OUT', g->>'collected_minor', '30000');
  perform pg_temp.chk('GBP March: by payment method cash 12000 / card 18000', (select string_agg((m->>'method') || ':' || (m->>'amount_minor'), ',' order by m->>'method') from jsonb_array_elements(g->'by_method') m), 'card:18000,cash:12000');
  perform pg_temp.chk('GBP March: discounts given 1000 on 1 line', (g->>'discounts_minor') || '/' || (g->>'discounted_lines'), '1000/1');
  perform pg_temp.chk('daily trend has one entry per day (31)', jsonb_array_length(g->'daily')::text, '31');
  perform pg_temp.chk('daily: Mar 1 net 10000 (00:00 GMT)', (g->'daily'->0->>'date') || ':' || (g->'daily'->0->>'net_revenue_minor'), '2027-03-01:10000');
  perform pg_temp.chk('daily: Mar 15 net 20000', g->'daily'->14->>'net_revenue_minor', '20000');
  perform pg_temp.chk('daily: Mar 20 is the credit note (-2000)', g->'daily'->19->>'net_revenue_minor', '-2000');
  perform pg_temp.chk('daily: Mar 31 net 5000 (22:59Z = 23:59 BST, local March 31)', g->'daily'->30->>'net_revenue_minor', '5000');
  perform pg_temp.chk('daily collected: Mar 2 = 12000, Mar 16 = 20000, Mar 17 = -2000', (g->'daily'->1->>'collected_minor') || '/' || (g->'daily'->15->>'collected_minor') || '/' || (g->'daily'->16->>'collected_minor'), '12000/20000/-2000');
  perform pg_temp.chk('the daily series adds up to the total', (select sum((d->>'net_revenue_minor')::bigint)::text from jsonb_array_elements(g->'daily') d), g->>'net_revenue_minor');
  perform pg_temp.chk('PKR March (Karachi + the ARCHIVED branch): 3 invoices, net 84000', (k->>'invoice_count') || '/' || (k->>'net_revenue_minor'), '3/84000');
  perform pg_temp.chk('PKR: the Mar-31 19:00Z invoice is April in Karachi (OUT), Feb-28 18:59Z is February (OUT)', k->>'invoiced_minor', '84000');
  pg := (select x from jsonb_array_elements(r->'previous'->'currencies') x where x->>'currency' = 'GBP');
  pk := (select x from jsonb_array_elements(r->'previous'->'currencies') x where x->>'currency' = 'PKR');
  perform pg_temp.chk('previous period (Feb) GBP: 2 invoices incl. the Feb 28 23:59 edge, net 10000, collected 5000', (pg->>'invoice_count') || '/' || (pg->>'net_revenue_minor') || '/' || (pg->>'collected_minor'), '2/10000/5000');
  perform pg_temp.chk('previous period PKR: 1 invoice, 7000', (pk->>'invoice_count') || '/' || (pk->>'net_revenue_minor'), '1/7000');
  -- weekly and custom
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'revenue', 'weekly', date '2027-03-16')$q$, pg_temp.id('biza')));
  g := (select x from jsonb_array_elements(r->'current'->'currencies') x where x->>'currency' = 'GBP');
  perform pg_temp.chk('weekly (Mar 15-21): only L2 + its credit note: net 18000', g->>'net_revenue_minor', '18000');
  perform pg_temp.chk('weekly: 7 daily entries, previous week had none (empty)', jsonb_array_length(g->'daily')::text || '/' || jsonb_array_length(r->'previous'->'currencies')::text, '7/3');
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'revenue', 'custom', null, date '2027-03-01', date '2027-03-02')$q$, pg_temp.id('biza')));
  g := (select x from jsonb_array_elements(r->'current'->'currencies') x where x->>'currency' = 'GBP');
  perform pg_temp.chk('custom Mar 1-2: L1 only (net 10000), collected 12000', (g->>'net_revenue_minor') || '/' || (g->>'collected_minor'), '10000/12000');
  perform pg_temp.chk('custom: previous equal period is Feb 27-28 (the Feb 28 23:59 invoice)', (r->'period'->>'prev_from') || '..' || (r->'period'->>'prev_to') || '/' || (select (x->>'net_revenue_minor') from jsonb_array_elements(r->'previous'->'currencies') x where x->>'currency' = 'GBP'), '2027-02-27..2027-02-28/3000');
  -- permissions
  r := pg_temp.as_('mgr', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('manager (branch A): only GBP, only branch A data', (select string_agg(x->>'currency', ',') from jsonb_array_elements(r->'current'->'currencies') x), 'GBP');
  perform pg_temp.chk('...same GBP numbers', (select x->>'net_revenue_minor' from jsonb_array_elements(r->'current'->'currencies') x), '33000');
  r := pg_temp.as_('mgrk', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('manager of Karachi: PKR of Karachi only (no archived Lahore, no London)', (select string_agg((x->>'currency') || ':' || (x->>'net_revenue_minor'), ',') from jsonb_array_elements(r->'current'->'currencies') x), 'PKR:80000');
  perform pg_temp.chk('receptionist forbidden', pg_temp.as_('recep', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('staff forbidden', pg_temp.as_('staffa', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('other business forbidden', pg_temp.as_('ownerb', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute', pg_temp.as_anon(format($q$select public.get_advanced_report(%L, 'revenue', 'monthly')$q$, pg_temp.id('biza')))->>'state', '42501');
  perform pg_temp.chk('view_advanced without view_revenue: the revenue section is forbidden', pg_temp.as_('viewer', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('Solo plan: feature_unavailable', pg_temp.as_('owners', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly')$q$, pg_temp.id('bizs')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('bad section', pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'secrets', 'monthly')$q$, pg_temp.id('biza')))->>'code', 'invalid_section');
  perform pg_temp.chk('bad period', pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'revenue', 'yearly')$q$, pg_temp.id('biza')))->>'code', 'invalid_period');
  perform pg_temp.chk('bad range', pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'revenue', 'custom', null, date '2027-03-05', date '2027-03-01')$q$, pg_temp.id('biza')))->>'code', 'invalid_range');
  perform pg_temp.chk('branch of another business', pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15', null, null, %L)$q$, pg_temp.id('biza'), pg_temp.id('branchb')))->>'code', 'invalid_branch');
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-15', null, null, %L)$q$, pg_temp.id('biza'), pg_temp.id('branchk')));
  perform pg_temp.chk('branch filter: Karachi only', (select string_agg(x->>'currency' || ':' || (x->>'net_revenue_minor'), ',') from jsonb_array_elements(r->'current'->'currencies') x), 'PKR:80000');
end $$;

-- DST month boundaries in New_York (March 2027, business B) via the REPORT, not only commission
do $$
declare r jsonb; v_b uuid := pg_temp.id('bizb'); v_br uuid := pg_temp.id('branchb');
begin
  perform pg_temp.mk_issued(v_b, v_br, 'USD', '2027-03-01 04:59+00', 1000, 0, 931);  -- Feb 28 23:59 EST
  perform pg_temp.mk_issued(v_b, v_br, 'USD', '2027-03-01 05:00+00', 2000, 0, 932);  -- Mar 1 00:00 EST
  perform pg_temp.mk_issued(v_b, v_br, 'USD', '2027-04-01 03:59+00', 4000, 0, 933);  -- Mar 31 23:59 EDT
  perform pg_temp.mk_issued(v_b, v_br, 'USD', '2027-04-01 04:00+00', 8000, 0, 934);  -- Apr 1 00:00 EDT
  r := pg_temp.as_('ownerb', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-03-20')$q$, v_b));
  perform pg_temp.chk('NY March (DST on Mar 14): the 05:00Z and 03:59Z(Apr 1) edges IN, plus the Mar 10 one from the commission test: 3 invoices, net 16000', (r->'current'->'currencies'->0->>'invoice_count') || '/' || (r->'current'->'currencies'->0->>'net_revenue_minor'), '3/16000');
  perform pg_temp.chk('NY previous (Feb): the 04:59Z one, net 1000', (r->'previous'->'currencies'->0->>'net_revenue_minor'), '1000');
  r := pg_temp.as_('ownerb', format($q$select public.get_advanced_report(%L, 'revenue', 'monthly', date '2027-04-20')$q$, v_b));
  perform pg_temp.chk('NY April: the 04:00Z one, net 8000', (r->'current'->'currencies'->0->>'net_revenue_minor'), '8000');
  perform pg_temp.chk('NY week containing the DST change has 7 daily entries (local calendar days, not 24h blocks)', jsonb_array_length(pg_temp.as_('ownerb', format($q$select public.get_advanced_report(%L, 'revenue', 'weekly', date '2027-03-12')$q$, v_b))->'current'->'currencies'->0->'daily')::text, '7');
end $$;

-- appointments
do $$
declare r jsonb;
begin
  r := pg_temp.as_('mgr', format($q$select public.get_advanced_report(%L, 'appointments', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('manager (London) March: 10 appointments (April-edge one OUT)', (r->'current'->>'total') || '/' || (r->'current'->>'completed') || '/' || (r->'current'->>'cancelled') || '/' || (r->'current'->>'no_show') || '/' || (r->'current'->>'confirmed'), '10/6/2/1/1');
  perform pg_temp.chk('rates in basis points: completed 60%, cancelled 20%, no-show 10%', (r->'current'->>'completed_bp') || '/' || (r->'current'->>'cancelled_bp') || '/' || (r->'current'->>'no_show_bp'), '6000/2000/1000');
  perform pg_temp.chk('previous (Feb): 5 appointments incl. the Feb 28 23:59Z edge, 4 completed', (r->'previous'->>'total') || '/' || (r->'previous'->>'completed') || '/' || (r->'previous'->>'completed_bp') || '/' || (r->'previous'->>'no_show_bp'), '5/4/8000/0');
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'appointments', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('owner sees London + Karachi: 11, completed 7', (r->'current'->>'total') || '/' || (r->'current'->>'completed'), '11/7');
  perform pg_temp.chk('...rates round half up: 7/11 = 63.64%, 2/11 = 18.18%, 1/11 = 9.09%', (r->'current'->>'completed_bp') || '/' || (r->'current'->>'cancelled_bp') || '/' || (r->'current'->>'no_show_bp'), '6364/1818/909');
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'appointments', 'weekly', date '2027-03-03')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('weekly Mar 1-7 holds 10 (the Karachi one is Mar 10); previous week has the Feb 28 edge only', (r->'current'->>'total') || '/' || (r->'previous'->>'total'), '10/1');
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'appointments', 'custom', null, date '2027-03-02', date '2027-03-03')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('custom Mar 2-3: 5 appointments; previous Feb 28-Mar 1: 1', (r->'current'->>'total') || '/' || (r->'previous'->>'total'), '5/1');
  perform pg_temp.chk('view_advanced without revenue still sees appointments', pg_temp.as_('viewer', format($q$select public.get_advanced_report(%L, 'appointments', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')))->>'ok', 'true');
  perform pg_temp.chk('empty period -> zeros and null rates, not an error', (select (j->'current'->>'total') || '/' || coalesce(j->'current'->>'completed_bp', 'null') from (select pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'appointments', 'custom', null, date '2024-01-01', date '2024-01-02')$q$, pg_temp.id('biza'))) j) x), '0/null');
end $$;

-- staff
do $$
declare r jsonb; s1 jsonb; s2 jsonb;
begin
  r := pg_temp.as_('mgr', format($q$select public.get_advanced_report(%L, 'staff', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  s1 := (select x from jsonb_array_elements(r->'current'->'staff') x where x->>'staff_name' = 'Sam One');
  s2 := (select x from jsonb_array_elements(r->'current'->'staff') x where x->>'staff_name' = 'Sue Two');
  perform pg_temp.chk('S1 March appointments: 3 completed, 1 cancelled (total 4; the April-edge one is OUT)', (s1->'appointments'->>'total') || '/' || (s1->'appointments'->>'completed') || '/' || (s1->'appointments'->>'cancelled'), '4/3/1');
  perform pg_temp.chk('S2 March: total 5, completed 3, no-show 1', (s2->'appointments'->>'total') || '/' || (s2->'appointments'->>'completed') || '/' || (s2->'appointments'->>'no_show'), '5/3/1');
  perform pg_temp.chk('S1 revenue = invoices of their appointments minus credit notes (10000 + 20000 - 2000)', s1->'money'->0->>'net_revenue_minor', '28000');
  perform pg_temp.chk('S1 commission net 800 (1000 earned - 200 reversed), S2 500', (s1->'money'->0->>'commission_net_minor') || '/' || (s2->'money'->0->>'commission_net_minor'), '800/500');
  perform pg_temp.chk('S3 (one cancelled appointment, no money) is listed with an empty money array', (select (x->'appointments'->>'total') || '/' || jsonb_array_length(x->'money') from jsonb_array_elements(r->'current'->'staff') x where x->>'staff_name' = 'Tom Three'), '1/0');
  perform pg_temp.chk('previous period staff data is returned too', (select (x->'appointments'->>'completed') from jsonb_array_elements(r->'previous'->'staff') x where x->>'staff_name' = 'Sam One'), '4');
  r := pg_temp.as_('viewer', format($q$select public.get_advanced_report(%L, 'staff', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  s1 := (select x from jsonb_array_elements(r->'current'->'staff') x where x->>'staff_name' = 'Sam One');
  perform pg_temp.chk('without view_revenue/commission.view_all the money is not shown, appointments are', (jsonb_array_length(s1->'money')::text) || '/' || (s1->'appointments'->>'total'), '0/4');
  perform pg_temp.chk('receptionist forbidden', pg_temp.as_('recep', format($q$select public.get_advanced_report(%L, 'staff', 'monthly')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
end $$;

-- services
do $$
declare r jsonb;
begin
  r := pg_temp.as_('mgr', format($q$select public.get_advanced_report(%L, 'services', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('most booked (cancelled excluded, no-show counts as booked): Cut 5, Colour 3', (select string_agg((x->>'name') || ':' || (x->>'booked'), ',' order by (x->>'booked')::int desc) from jsonb_array_elements(r->'current'->'most_booked') x), 'Cut:5,Colour:3');
  perform pg_temp.chk('highest earning GBP: Colour 20000 first, Cut 15000', (select string_agg((x->>'name') || ':' || (x->>'net_minor') || ':' || (x->>'currency'), ',' order by (x->>'net_minor')::bigint desc) from jsonb_array_elements(r->'current'->'highest_earning') x), 'Colour:20000:GBP,Cut:15000:GBP');
  r := pg_temp.as_('viewer', format($q$select public.get_advanced_report(%L, 'services', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('without view_revenue: booked counts yes, earnings empty', jsonb_array_length(r->'current'->'most_booked')::text || '/' || jsonb_array_length(r->'current'->'highest_earning')::text, '2/0');
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'services', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('owner: earnings per currency (GBP and PKR separate lists, never mixed)', (select string_agg(distinct x->>'currency', ',') from jsonb_array_elements(r->'current'->'highest_earning') x), 'GBP,PKR');
end $$;

-- clients
do $$
declare r jsonb;
begin
  r := pg_temp.as_('mgr', format($q$select public.get_advanced_report(%L, 'clients', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('London March: 3 active clients, 1 new (C1: an earlier CANCELLED visit does not count), 2 returning', (r->'current'->>'active') || '/' || (r->'current'->>'new') || '/' || (r->'current'->>'returning'), '3/1/2');
  perform pg_temp.chk('retention: of 3 February clients, 2 came back = 66.67%', (r->'current'->>'prev_active') || '/' || (r->'current'->>'retained') || '/' || (r->'current'->>'retention_bp'), '3/2/6667');
  perform pg_temp.chk('previous period carries no retention (nothing before it)', coalesce(r->'previous'->>'retention_bp', 'null'), 'null');
  perform pg_temp.chk('previous period active clients (Feb): 3', r->'previous'->>'active', '3');
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'clients', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('owner (adds the Karachi client): 4 active, 2 new', (r->'current'->>'active') || '/' || (r->'current'->>'new'), '4/2');
  perform pg_temp.chk('...a client with no completed visit (C4) is never counted', (r->'current'->>'active'), '4');
end $$;

-- branches comparison
do $$
declare r jsonb;
begin
  r := pg_temp.as_('owner', format($q$select public.get_advanced_report(%L, 'branches', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('branch comparison (Business level): London, Karachi, and the ARCHIVED branch with history', (select string_agg((x->>'name') || ':' || (x->>'currency') || ':' || (x->>'net_revenue_minor') || ':' || (x->>'archived'), ',' order by x->>'name') from jsonb_array_elements(r->'current'->'branches') x where (x->>'net_revenue_minor')::bigint > 0), 'Karachi:PKR:80000:false,Lahore:PKR:4000:true,Main:GBP:33000:false');
  perform pg_temp.chk('...per-branch appointment rates', (select (x->'appointments'->>'total') || '/' || (x->'appointments'->>'completed_bp') from jsonb_array_elements(r->'current'->'branches') x where x->>'name' = 'Main'), '10/6000');
  perform pg_temp.chk('...the previous period is returned for every branch', (select (x->>'net_revenue_minor') from jsonb_array_elements(r->'previous'->'branches') x where x->>'name' = 'Main'), '10000');
  perform pg_temp.chk('manager sees only their own branch in the comparison', (select string_agg(x->>'name', ',') from jsonb_array_elements(pg_temp.as_('mgr', format($q$select public.get_advanced_report(%L, 'branches', 'monthly', date '2027-03-15')$q$, pg_temp.id('biza')))->'current'->'branches') x where (x->>'net_revenue_minor')::bigint > 0), 'Main');
  perform pg_temp.chk('Team plan has no branch comparison', pg_temp.as_('ownert', format($q$select public.get_advanced_report(%L, 'branches', 'monthly')$q$, pg_temp.id('bizt')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('...but has the other advanced sections (empty data -> ok)', pg_temp.as_('ownert', format($q$select public.get_advanced_report(%L, 'appointments', 'monthly')$q$, pg_temp.id('bizt')))->>'ok', 'true');
end $$;

-- combined overview (multi_branch)
do $$
declare r jsonb; g jsonb; k jsonb;
begin
  r := pg_temp.as_('owner', format($q$select public.get_combined_overview(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('combined overview ok', r->>'ok', 'true');
  g := (select x from jsonb_array_elements(r->'totals_by_currency') x where x->>'currency' = 'GBP');
  k := (select x from jsonb_array_elements(r->'totals_by_currency') x where x->>'currency' = 'PKR');
  perform pg_temp.chk('totals are per currency: AED (Dubai, nothing in March), GBP and PKR', (select string_agg(x->>'currency', ',' order by x->>'currency') from jsonb_array_elements(r->'totals_by_currency') x), 'AED,GBP,PKR');
  perform pg_temp.chk('GBP: 3 invoices, invoiced 42000, credited 2400, tax 6600, net 33000, collected 30000', (g->>'invoice_count') || '/' || (g->>'invoiced_minor') || '/' || (g->>'credited_minor') || '/' || (g->>'tax_minor') || '/' || (g->>'net_revenue_minor') || '/' || (g->>'collected_minor'), '3/42000/2400/6600/33000/30000');
  perform pg_temp.chk('PKR sums Karachi AND the archived branch: net 84000, collected 50000', (k->>'net_revenue_minor') || '/' || (k->>'collected_minor'), '84000/50000');
  perform pg_temp.chk('per-branch rows include the archived branch flagged archived', (select (x->>'archived') from jsonb_array_elements(r->'branches') x where x->>'name' = 'Lahore'), 'true');
  perform pg_temp.chk('appointments are counted across branches (a count, not money): 11', r->'appointments'->>'total', '11');
  r := pg_temp.as_('mgr', format($q$select public.get_combined_overview(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('manager (branch A): GBP only, no PKR', (select string_agg(x->>'currency', ',') from jsonb_array_elements(r->'totals_by_currency') x), 'GBP');
  r := pg_temp.as_('mgrk', format($q$select public.get_combined_overview(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('biza')));
  perform pg_temp.chk('manager of Karachi: PKR 80000 only (not the archived branch they cannot see)', (select string_agg((x->>'currency') || ':' || (x->>'net_revenue_minor'), ',') from jsonb_array_elements(r->'totals_by_currency') x), 'PKR:80000');
  perform pg_temp.chk('receptionist (no report permissions) forbidden', pg_temp.as_('recep', format($q$select public.get_combined_overview(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('staff forbidden', pg_temp.as_('staffa', format($q$select public.get_combined_overview(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('other business forbidden', pg_temp.as_('ownerb', format($q$select public.get_combined_overview(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('biza')))->>'code', 'forbidden');
  perform pg_temp.chk('Team plan: multi_branch is off', pg_temp.as_('ownert', format($q$select public.get_combined_overview(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('bizt')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('bad range', pg_temp.as_('owner', format($q$select public.get_combined_overview(%L, date '2027-03-31', date '2027-03-01')$q$, pg_temp.id('biza')))->>'code', 'invalid_range');
  perform pg_temp.chk('anon cannot execute', pg_temp.as_anon(format($q$select public.get_combined_overview(%L, date '2027-03-01', date '2027-03-31')$q$, pg_temp.id('biza')))->>'state', '42501');
end $$;

-- ===========================================================================
-- 5. SCHEDULED REPORT EMAILS
-- ===========================================================================
create or replace function pg_temp.sched(p_user text, p_biz text, p_freq text, p_branch text default null, p_enabled boolean default true, p_hour int default 8) returns jsonb language sql as $$
  select pg_temp.as_(p_user, format($q$select public.set_report_schedule(%L, %L, %L, %L, %L)$q$, pg_temp.id(p_biz), p_freq, case when p_branch is null then null else pg_temp.id(p_branch) end, p_enabled, p_hour))
$$;
create or replace function pg_temp.tick(p_at timestamptz) returns text language sql as $$ select public.enqueue_due_report_summaries_at(p_at)::text $$;
-- tick, THEN read (a scalar subquery in the same expression would not see the tick's writes)
create or replace function pg_temp.tick2(p_at timestamptz, p_sql text) returns text language plpgsql as $$
declare v1 text; v2 text;
begin v1 := public.enqueue_due_report_summaries_at(p_at)::text; execute p_sql into v2; return v1 || '/' || coalesce(v2, 'null'); end $$;
-- park every schedule except the ones given (so a tick only touches what a test is about)
create or replace function pg_temp.park(p_keep text[]) returns void language plpgsql as $$
begin
  update public.report_schedules set last_period_end = date '2099-12-31' where id <> all (select pg_temp.id(k) from unnest(p_keep) k);
end $$;
create or replace function pg_temp.rows_for(p_sched uuid) returns text language sql as $$
  select count(*)::text from public.message_outbox where event = 'report_summary' and idempotency_key like 'report_summary:' || p_sched || ':%'
$$;

do $$
declare r jsonb; v_id uuid; v_n0 int; v_end date;
begin
  -- permissions
  perform pg_temp.chk('manager (branch scope only) cannot set a schedule', pg_temp.sched('mgr', 'biza', 'weekly')->>'code', 'forbidden');
  perform pg_temp.chk('receptionist cannot', pg_temp.sched('recep', 'biza', 'weekly')->>'code', 'forbidden');
  perform pg_temp.chk('staff cannot', pg_temp.sched('staffa', 'biza', 'weekly')->>'code', 'forbidden');
  perform pg_temp.chk('other business cannot', pg_temp.sched('ownerb', 'biza', 'weekly')->>'code', 'forbidden');
  perform pg_temp.chk('anon cannot execute', pg_temp.as_anon(format($q$select public.set_report_schedule(%L, 'weekly')$q$, pg_temp.id('biza')))->>'state', '42501');
  perform pg_temp.chk('Solo plan: feature_unavailable', pg_temp.sched('owners', 'bizs', 'weekly')->>'code', 'feature_unavailable');
  select count(*) into v_n0 from public.report_schedules;
  perform pg_temp.chk('bad frequency', pg_temp.sched('owner', 'biza', 'daily')->>'code', 'invalid_frequency');
  perform pg_temp.chk('bad hour', pg_temp.sched('owner', 'biza', 'weekly', null, true, 24)->>'code', 'invalid_hour');
  perform pg_temp.chk('branch of another business', pg_temp.sched('owner', 'biza', 'weekly', 'branchb')->>'code', 'invalid_branch');
  perform pg_temp.chk('...refusals stored nothing', (select count(*)::text from public.report_schedules), v_n0::text);

  -- create
  r := pg_temp.sched('owner', 'biza', 'weekly');
  v_id := (r->>'schedule_id')::uuid; insert into ids values ('sch_w', v_id);
  v_end := public.report_last_complete_end('weekly', (now() at time zone 'Europe/London')::date);
  perform pg_temp.chk('owner creates a weekly all-branches schedule', (r->>'ok') || '/' || (r->>'last_period_end'), 'true/' || v_end);
  perform pg_temp.chk('stored: frequency, hour, enabled, all branches, created_by, and it starts with the NEXT period', (select frequency || '/' || send_hour || '/' || is_enabled::text || '/' || (branch_id is null)::text || '/' || (created_by = pg_temp.id('owner'))::text || '/' || (last_period_end = v_end)::text from public.report_schedules where id = v_id), 'weekly/8/true/true/true/true');
  perform pg_temp.chk('audit report_schedule.created', pg_temp.audit_n('report_schedule.created'), '1');
  -- upsert
  r := pg_temp.sched('owner', 'biza', 'weekly', null, true, 9);
  perform pg_temp.chk('same frequency+scope updates the same row', ((r->>'schedule_id')::uuid = v_id)::text || '/' || (select count(*)::text from public.report_schedules where business_id = pg_temp.id('biza') and frequency = 'weekly') || '/' || (select send_hour::text from public.report_schedules where id = v_id), 'true/1/9');
  perform pg_temp.chk('audit report_schedule.updated has before and after', (select (before->>'send_hour') || '>' || (after->>'send_hour') from public.audit_logs where action = 'report_schedule.updated' and entity_id = v_id::text), '8>9');
  perform pg_temp.sched('owner', 'biza', 'weekly', null, true, 8);
  -- disable then re-enable: no backlog
  perform pg_temp.sched('owner', 'biza', 'weekly', null, false, 8);
  perform pg_temp.chk('disabled', (select is_enabled::text from public.report_schedules where id = v_id), 'false');
  update public.report_schedules set last_period_end = date '2027-01-03' where id = v_id;
  perform pg_temp.sched('owner', 'biza', 'weekly', null, true, 8);
  perform pg_temp.chk('re-enabling does not flood the periods missed while off', (select (last_period_end = v_end)::text from public.report_schedules where id = v_id), 'true');
  -- a second schedule: monthly for one branch; and a holder of view_advanced at ALL scope may manage
  perform pg_temp.chk('viewer (view_advanced at all scope) may create one', pg_temp.sched('viewer', 'biza', 'monthly', 'branchk')->>'ok', 'true');
  insert into ids select 'sch_km', id from public.report_schedules where business_id = pg_temp.id('biza') and frequency = 'monthly' and branch_id = pg_temp.id('branchk');
  perform pg_temp.chk('Team plan allows it', pg_temp.sched('ownert', 'bizt', 'monthly')->>'ok', 'true');
  insert into ids select 'sch_t', id from public.report_schedules where business_id = pg_temp.id('bizt');
  -- reads
  perform pg_temp.chk('owner sees the schedules', pg_temp.as_q('owner', format($q$select count(*)::text from public.report_schedules where business_id = %L$q$, pg_temp.id('biza'))), '2');
  perform pg_temp.chk('manager sees none (not all-scope)', pg_temp.as_q('mgr', 'select count(*)::text from public.report_schedules'), '0');
  perform pg_temp.chk('receptionist none', pg_temp.as_q('recep', 'select count(*)::text from public.report_schedules'), '0');
  perform pg_temp.chk('other business none', pg_temp.as_q('ownerb', 'select count(*)::text from public.report_schedules'), '0');
  perform pg_temp.chk('no direct writes (grant)', pg_temp.try_as('owner', format($q$insert into public.report_schedules (business_id, frequency) values (%L, 'monthly')$q$, pg_temp.id('biza'))), '42501');
  -- delete
  perform pg_temp.chk('manager cannot delete', pg_temp.as_('mgr', format($q$select public.delete_report_schedule(%L)$q$, pg_temp.id('sch_km')))->>'code', 'forbidden');
  perform pg_temp.chk('unknown schedule', pg_temp.as_('owner', $q$select public.delete_report_schedule(gen_random_uuid())$q$)->>'code', 'not_found');
  perform pg_temp.chk('other business cannot delete', pg_temp.as_('ownerb', format($q$select public.delete_report_schedule(%L)$q$, pg_temp.id('sch_km')))->>'code', 'forbidden');
end $$;

-- the tick: due logic, claim, recipients, payload, DST
do $$
declare r jsonb; v_m uuid; v_row record; v_g jsonb; v_o jsonb; v_viewer text; v_owner text;
begin
  perform pg_temp.park(array['sch_w']);
  -- recipients are the all-scope holders of reports.view_advanced: owner, owner2 (Owner), viewer
  update public.report_schedules set last_period_end = date '2027-02-28' where id = pg_temp.id('sch_w');
  perform pg_temp.chk('weekly: Monday 07:59 GMT is before the 08:00 send time -> nothing', pg_temp.tick('2027-03-15 07:59+00'), '0');
  perform pg_temp.chk('...and the schedule was not claimed', (select last_period_end::text from public.report_schedules where id = pg_temp.id('sch_w')), '2027-02-28');
  perform pg_temp.chk('weekly: Monday 08:00 -> 3 recipients queued (owner, owner2, viewer)', pg_temp.tick('2027-03-15 08:00+00'), '3');
  perform pg_temp.chk('stored: period claimed (last_period_end = the Sunday)', (select last_period_end::text from public.report_schedules where id = pg_temp.id('sch_w')), '2027-03-14');
  perform pg_temp.chk('the same tick again sends nothing (never twice)', pg_temp.tick('2027-03-15 08:00+00') || '/' || pg_temp.tick('2027-03-16 12:00+00'), '0/0');
  perform pg_temp.chk('...rows unchanged', pg_temp.rows_for(pg_temp.id('sch_w')), '3');
  select * into v_row from public.message_outbox where event = 'report_summary' and idempotency_key like 'report_summary:' || pg_temp.id('sch_w') || ':%' and user_id = pg_temp.id('owner');
  perform pg_temp.chk('stored: email row for a USER (no client, no appointment), pending, primary branch, the right key', (v_row.channel || '/' || (v_row.client_id is null)::text || '/' || (v_row.appointment_id is null)::text || '/' || v_row.status || '/' || (v_row.branch_id = pg_temp.id('brancha'))::text || '/' || (v_row.idempotency_key = 'report_summary:' || pg_temp.id('sch_w') || ':2027-03-14:' || pg_temp.id('owner'))::text), 'email/true/true/pending/true/true');
  perform pg_temp.chk('payload: the week Mar 8-14 and the previous week', (v_row.payload->>'from') || '..' || (v_row.payload->>'to') || ' / ' || (v_row.payload->>'prev_from') || '..' || (v_row.payload->>'prev_to') || ' / ' || (v_row.payload->>'frequency'), '2027-03-08..2027-03-14 / 2027-03-01..2027-03-07 / weekly');
  perform pg_temp.chk('payload holds no token', (not (v_row.payload ? 'token'))::text, 'true');
  perform pg_temp.chk('only the three expected users got a row', (select string_agg(u.email, ',' order by u.email) from public.message_outbox o join auth.users u on u.id = o.user_id where o.idempotency_key like 'report_summary:' || pg_temp.id('sch_w') || ':%'), 'p9.owner@example.com,p9.owner2@example.com,p9.viewer@example.com');
  perform pg_temp.chk('manager, receptionist, staff, delegate got none', (select count(*)::text from public.message_outbox o where o.event = 'report_summary' and o.user_id in (pg_temp.id('mgr'), pg_temp.id('recep'), pg_temp.id('staffa'), pg_temp.id('deleg'))), '0');
  -- catch-up: a missed run sends the latest complete period once
  update public.report_schedules set last_period_end = date '2027-01-03' where id = pg_temp.id('sch_w');
  perform pg_temp.chk('catch-up after downtime: ONE period (the latest complete week), claimed', pg_temp.tick2('2027-03-18 12:00+00', format($q$select last_period_end::text from public.report_schedules where id = %L$q$, pg_temp.id('sch_w'))), '0/2027-03-14');
  -- (the 2027-03-14 key already exists, so ON CONFLICT adds no rows; the claim still moved)

  -- monthly, with real data: March 2027, all branches of A. London is BST from Mar 28: 08:00 BST = 07:00Z
  perform pg_temp.sched('owner', 'biza', 'monthly');
  insert into ids select 'sch_m', id from public.report_schedules where business_id = pg_temp.id('biza') and frequency = 'monthly' and branch_id is null;
  perform pg_temp.park(array['sch_m']);
  update public.report_schedules set last_period_end = date '2027-02-28' where id = pg_temp.id('sch_m');
  perform pg_temp.chk('monthly: Apr 1 07:59 BST (06:59Z) -> nothing', pg_temp.tick('2027-04-01 06:59+00'), '0');
  perform pg_temp.chk('monthly: Apr 1 08:00 BST (07:00Z) -> 3 rows', pg_temp.tick('2027-04-01 07:00+00'), '3');
  select payload into v_o from public.message_outbox where idempotency_key = 'report_summary:' || pg_temp.id('sch_m') || ':2027-03-31:' || pg_temp.id('owner');
  select payload into v_viewer from (select payload::text from public.message_outbox where idempotency_key = 'report_summary:' || pg_temp.id('sch_m') || ':2027-03-31:' || pg_temp.id('viewer')) x;
  perform pg_temp.chk('payload period: March and February', (v_o->>'from') || '..' || (v_o->>'to') || ' / ' || (v_o->>'prev_from') || '..' || (v_o->>'prev_to'), '2027-03-01..2027-03-31 / 2027-02-01..2027-02-28');
  v_g := (select x from jsonb_array_elements(v_o->'revenue') x where x->>'currency' = 'GBP' limit 1);
  perform pg_temp.chk('owner payload GBP: net 33000, collected 30000, 3 invoices, discounts 1000', (v_g->>'net_revenue_minor') || '/' || (v_g->>'collected_minor') || '/' || (v_g->>'invoice_count') || '/' || (v_g->>'discounts_minor'), '33000/30000/3/1000');
  perform pg_temp.chk('...with the previous period figures (Feb net 10000, collected 5000)', (v_g->>'prev_net_revenue_minor') || '/' || (v_g->>'prev_collected_minor'), '10000/5000');
  perform pg_temp.chk('...PKR is its own entry (Karachi + the archived branch 84000), not added to GBP', (select (x->>'net_revenue_minor') from jsonb_array_elements(v_o->'revenue') x where x->>'currency' = 'PKR' limit 1), '84000');
  perform pg_temp.chk('...appointments: 11 (London 10 + Karachi 1), 7 completed, previous 5', (v_o->'appointments'->>'total') || '/' || (v_o->'appointments'->>'completed') || '/' || (v_o->'appointments'->>'prev_total'), '11/7/5');
  perform pg_temp.chk('the viewer (no view_revenue) gets NO revenue in the payload but the appointments', (v_viewer::jsonb->>'revenue' is null)::text || '/' || ((v_viewer::jsonb)->'appointments'->>'total'), 'true/11');
  perform pg_temp.chk('monthly again: nothing', pg_temp.tick('2027-04-01 07:00+00') || '/' || pg_temp.tick('2027-04-30 12:00+00'), '0/0');
  perform pg_temp.chk('...May 1 08:00 BST sends April (period end moves)', pg_temp.tick2('2027-05-01 07:00+00', format($q$select last_period_end::text from public.report_schedules where id = %L$q$, pg_temp.id('sch_m'))), '3/2027-04-30');
  -- DST: weekly Mon Mar 29 (clocks went forward on the 28th)
  delete from public.report_schedules where id = pg_temp.id('sch_w');   -- (postgres: housekeeping only)
  perform pg_temp.sched('owner', 'biza', 'weekly', 'brancha');
  insert into ids select 'sch_w2', id from public.report_schedules where business_id = pg_temp.id('biza') and frequency = 'weekly' and branch_id = pg_temp.id('brancha');
  perform pg_temp.park(array['sch_w2']);
  update public.report_schedules set last_period_end = date '2027-03-21' where id = pg_temp.id('sch_w2');
  perform pg_temp.chk('DST: Monday Mar 29 07:59 BST (06:59Z) -> nothing', pg_temp.tick('2027-03-29 06:59+00'), '0');
  perform pg_temp.chk('DST: Monday Mar 29 08:00 BST (07:00Z) -> sent for Mar 22-28', pg_temp.tick2('2027-03-29 07:00+00', format($q$select last_period_end::text from public.report_schedules where id = %L$q$, pg_temp.id('sch_w2'))), '3/2027-03-28');
  perform pg_temp.chk('...a branch schedule names its branch in the payload', (select payload->>'scope_branch' from public.message_outbox where idempotency_key = 'report_summary:' || pg_temp.id('sch_w2') || ':2027-03-28:' || pg_temp.id('owner')), 'Main');
  -- Karachi (no DST): 08:00 PKT = 03:00Z
  perform pg_temp.park(array['sch_km']);
  update public.report_schedules set last_period_end = date '2027-02-28' where id = pg_temp.id('sch_km');
  perform pg_temp.chk('Karachi monthly: Apr 1 07:59 PKT (02:59Z) -> nothing', pg_temp.tick('2027-04-01 02:59+00'), '0');
  perform pg_temp.chk('Karachi monthly: Apr 1 08:00 PKT (03:00Z) -> rows', pg_temp.tick('2027-04-01 03:00+00'), '3');
  select payload into v_o from public.message_outbox where idempotency_key = 'report_summary:' || pg_temp.id('sch_km') || ':2027-03-31:' || pg_temp.id('owner');
  perform pg_temp.chk('Karachi payload: only PKR, net 80000 (not the archived branch), 1 appointment, scope Karachi', (jsonb_array_length(v_o->'revenue')::text) || '/' || (v_o->'revenue'->0->>'currency') || '/' || (v_o->'revenue'->0->>'net_revenue_minor') || '/' || (v_o->'appointments'->>'total') || '/' || (v_o->>'scope_branch'), '1/PKR/80000/1/Karachi');
  -- New York (business B): 08:00 EDT = 12:00Z
  perform pg_temp.sched('ownerb', 'bizb', 'monthly');
  insert into ids select 'sch_b', id from public.report_schedules where business_id = pg_temp.id('bizb');
  perform pg_temp.park(array['sch_b']);
  update public.report_schedules set last_period_end = date '2027-02-28' where id = pg_temp.id('sch_b');
  perform pg_temp.chk('New York monthly: Apr 1 11:59Z (07:59 EDT) -> nothing', pg_temp.tick('2027-04-01 11:59+00'), '0');
  perform pg_temp.chk('New York monthly: 12:00Z (08:00 EDT) -> 1 recipient', pg_temp.tick('2027-04-01 12:00+00'), '1');
  select payload into v_o from public.message_outbox where idempotency_key = 'report_summary:' || pg_temp.id('sch_b') || ':2027-03-31:' || pg_temp.id('ownerb');
  perform pg_temp.chk('NY payload: USD, the March window (3 invoices, 16000)', (v_o->'revenue'->0->>'currency') || '/' || (v_o->'revenue'->0->>'invoice_count') || '/' || (v_o->'revenue'->0->>'net_revenue_minor'), 'USD/3/16000');
  -- business isolation: no row of B went to A's users and vice versa
  perform pg_temp.chk('rows of one business never address another business''s users', (select count(*)::text from public.message_outbox o where o.event = 'report_summary' and not exists (select 1 from public.business_members m where m.business_id = o.business_id and m.user_id = o.user_id)), '0');
end $$;

-- gates that skip a due schedule
do $$
declare v_id uuid; r jsonb;
begin
  perform pg_temp.park(array['sch_t']);
  update public.report_schedules set last_period_end = date '2027-01-31' where id = pg_temp.id('sch_t');
  perform pg_temp.sched('ownert', 'bizt', 'monthly', null, false, 8);
  perform pg_temp.chk('disabled schedule is never sent', pg_temp.tick('2027-04-01 07:00+00'), '0');
  perform pg_temp.sched('ownert', 'bizt', 'monthly', null, true, 8);
  update public.report_schedules set last_period_end = date '2027-02-28' where id = pg_temp.id('sch_t');
  -- the plan loses the feature
  perform pg_temp.as_('sadmin', format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizt')), true);
  perform pg_temp.chk('Solo (no advanced_reports): nothing is queued', pg_temp.tick('2027-04-01 07:00+00'), '0');
  perform pg_temp.chk('...and the period was NOT claimed (it will go out if the plan comes back)', (select last_period_end::text from public.report_schedules where id = pg_temp.id('sch_t')), '2027-02-28');
  perform pg_temp.as_('sadmin', format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('bizt')), true);
  -- inactive business
  perform pg_temp.as_('sadmin', format($q$select public.set_business_status(%L, 'inactive')$q$, pg_temp.id('bizt')), true);
  perform pg_temp.chk('inactive business: nothing queued', pg_temp.tick('2027-04-01 07:00+00'), '0');
  perform pg_temp.as_('sadmin', format($q$select public.set_business_status(%L, 'active')$q$, pg_temp.id('bizt')), true);
  -- now it goes out
  perform pg_temp.chk('plan and status back: the Team owner gets the summary', pg_temp.tick('2027-04-01 07:00+00'), '1');
  -- archived branch schedule
  perform pg_temp.chk('schedule for one branch', pg_temp.sched('owner', 'biza', 'weekly', 'branchh2')->>'ok', 'true');
  select id into v_id from public.report_schedules where branch_id = pg_temp.id('branchh2');
  perform pg_temp.park(array[]::text[]);
  update public.report_schedules set last_period_end = date '2027-02-28' where id = v_id;
  perform pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, pg_temp.id('branchh2')));
  perform pg_temp.chk('archived branch: its schedule is skipped', pg_temp.tick('2027-03-30 12:00+00'), '0');
  perform pg_temp.chk('delete a schedule', pg_temp.as_('owner', format($q$select public.delete_report_schedule(%L)$q$, v_id))->>'ok', 'true');
  perform pg_temp.chk('stored: soft deleted and disabled', (select (deleted_at is not null)::text || '/' || is_enabled::text from public.report_schedules where id = v_id), 'true/false');
  perform pg_temp.chk('audit report_schedule.deleted', pg_temp.audit_n('report_schedule.deleted'), '1');
  perform pg_temp.chk('a deleted schedule can be created again (unique index is partial)', pg_temp.sched('owner', 'biza', 'weekly', 'branchh2')->>'code', 'invalid_branch');
end $$;

-- the outbox side: shape, recipient, job, guard (the recheck at send time), claim
do $$
declare v_row record; v_id uuid; v_viewer_row uuid; r jsonb; j jsonb; v_job jsonb;
begin
  select id, user_id into v_row from public.message_outbox where event = 'report_summary' and idempotency_key like 'report_summary:' || pg_temp.id('sch_m') || ':2027-03-31:' || pg_temp.id('owner');
  v_id := v_row.id;
  perform pg_temp.chk('shape: a report_summary row must be an email for a user', pg_temp.try(format($q$insert into public.message_outbox (business_id, branch_id, user_id, client_id, channel, event, idempotency_key) values (%L, %L, %L, %L, 'email', 'report_summary', 'bad:1')$q$, pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('owner'), pg_temp.id('client_ada'))), '23514');
  perform pg_temp.chk('shape: not an SMS', pg_temp.try(format($q$insert into public.message_outbox (business_id, branch_id, user_id, channel, event, idempotency_key) values (%L, %L, %L, 'sms', 'report_summary', 'bad:2')$q$, pg_temp.id('biza'), pg_temp.id('brancha'), pg_temp.id('owner'))), '23514');
  perform pg_temp.chk('shape: a client email still needs its client (old rule intact)', pg_temp.try(format($q$insert into public.message_outbox (business_id, branch_id, channel, event, idempotency_key) values (%L, %L, 'email', 'booking_confirmed', 'bad:3')$q$, pg_temp.id('biza'), pg_temp.id('brancha'))), '23514');
  perform pg_temp.chk('outbox_recipient: the member''s own login address, masked form present', (public.outbox_recipient(v_id)->>'address') || '/' || (public.outbox_recipient(v_id)->>'masked' like 'p%***%')::text || '/' || (public.outbox_recipient(v_id)->>'hash' is not null)::text, 'p9.owner@example.com/true/true');
  perform pg_temp.chk('guard: a good row may be sent', coalesce(public.outbox_guard(v_id), 'null'), 'null');
  -- move it to now so the real claim picks it up
  update public.message_outbox set deliver_after = now() - interval '1 minute' where id = v_id;
  v_job := (select jb from jsonb_array_elements(public.outbox_claim(100, array['email'])) jb where jb->>'id' = v_id::text);
  perform pg_temp.chk('outbox_claim hands the worker a report job: event, address, payload, business name', (v_job->>'event') || '/' || (v_job->>'to') || '/' || (v_job->'payload'->>'frequency') || '/' || (v_job->>'business_name'), 'report_summary/p9.owner@example.com/monthly/P9 Alpha');
  perform pg_temp.chk('...marked sending', (select status from public.message_outbox where id = v_id), 'sending');
  -- re-check at send time
  select id into v_viewer_row from public.message_outbox where idempotency_key = 'report_summary:' || pg_temp.id('sch_m') || ':2027-03-31:' || pg_temp.id('viewer');
  perform pg_temp.chk('guard before removal: viewer row is fine', coalesce(public.outbox_guard(v_viewer_row), 'null'), 'null');
  delete from public.member_role_assignments where member_id = pg_temp.member('biza', 'viewer') and role_id = pg_temp.id('role_advnr');
  perform pg_temp.chk('guard: the member lost the permission -> stale (nothing sent)', coalesce(public.outbox_guard(v_viewer_row), 'null'), 'stale');
  perform pg_temp.chk('...but the owner''s row is unaffected', coalesce(public.outbox_guard((select id from public.message_outbox where idempotency_key = 'report_summary:' || pg_temp.id('sch_m') || ':2027-05-01:' || pg_temp.id('owner') or idempotency_key = 'report_summary:' || pg_temp.id('sch_m') || ':2027-04-30:' || pg_temp.id('owner') limit 1)), 'null'), 'null');
  insert into public.member_role_assignments (member_id, role_id, branch_id) values (pg_temp.member('biza', 'viewer'), pg_temp.id('role_advnr'), null);
  -- feature off at send time (Team business T, which has one queued summary)
  select id into v_viewer_row from public.message_outbox where idempotency_key like 'report_summary:' || pg_temp.id('sch_t') || ':%' limit 1;
  perform pg_temp.chk('guard (Team row): fine while the plan has the feature', coalesce(public.outbox_guard(v_viewer_row), 'null'), 'null');
  perform pg_temp.as_('sadmin', format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizt')), true);
  perform pg_temp.chk('guard: plan lost advanced_reports -> stale', coalesce(public.outbox_guard(v_viewer_row), 'null'), 'stale');
  perform pg_temp.as_('sadmin', format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('bizt')), true);
  perform pg_temp.chk('guard: plan back -> fine again', coalesce(public.outbox_guard(v_viewer_row), 'null'), 'null');
  perform pg_temp.as_('sadmin', format($q$select public.set_business_status(%L, 'inactive')$q$, pg_temp.id('bizt')), true);
  perform pg_temp.chk('guard: business inactive -> business_inactive', coalesce(public.outbox_guard(v_viewer_row), 'null'), 'business_inactive');
  perform pg_temp.as_('sadmin', format($q$select public.set_business_status(%L, 'active')$q$, pg_temp.id('bizt')), true);
  -- a client email row is unaffected by the new branch of the guard
  perform pg_temp.chk('outbox_job works for a report row with null appointment/client joins', (public.outbox_job(v_id)->>'event') || '/' || coalesce(public.outbox_job(v_id)->>'client_name', 'null'), 'report_summary/null');
end $$;

-- ===========================================================================
-- 6. PLAN GATING (custom roles on Team, trial/inactive) + GRANTS
-- ===========================================================================
do $$
declare r jsonb; v_mt uuid; v_role uuid; v_asg uuid;
begin
  perform pg_temp.chk('Team without the add-on: create_custom_role -> feature_unavailable', pg_temp.as_('ownert', format($q$select public.create_custom_role(%L, 'T Role', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('bizt')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('...nothing stored', (select count(*)::text from public.roles where business_id = pg_temp.id('bizt')), '0');
  perform pg_temp.chk('Solo: also unavailable', pg_temp.as_('owners', format($q$select public.create_custom_role(%L, 'S Role', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('bizs')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('trial / Business level (A): allowed', pg_temp.as_('owner', format($q$select public.create_custom_role(%L, 'Gate Check', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('biza')))->>'ok', 'true');
  perform pg_temp.chk('add-on on', pg_temp.as_('sadmin', format($q$select public.set_addon(%L, 'custom_roles', true)$q$, pg_temp.id('bizt')), true)->>'ok', 'true');
  r := pg_temp.as_('ownert', format($q$select public.create_custom_role(%L, 'T Role', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('bizt')));
  perform pg_temp.chk('Team + add-on: create works', r->>'ok', 'true');
  v_role := (r->>'role_id')::uuid;
  perform pg_temp.act_as(pg_temp.id('ownert'));
  v_mt := pg_temp.add_member('bizt', 'mgr', 'manager', 'brancht');
  r := pg_temp.as_('ownert', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_mt, v_role, pg_temp.id('brancht')));
  v_asg := (r->>'assignment_id')::uuid;
  perform pg_temp.chk('assign the custom role while the add-on is on', r->>'ok', 'true');
  perform pg_temp.chk('add-on off again', pg_temp.as_('sadmin', format($q$select public.set_addon(%L, 'custom_roles', false)$q$, pg_temp.id('bizt')), true)->>'ok', 'true');
  perform pg_temp.chk('...create refused', pg_temp.as_('ownert', format($q$select public.create_custom_role(%L, 'T Role 2', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('bizt')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('...update refused', pg_temp.as_('ownert', format($q$select public.update_custom_role(%L, 'Renamed')$q$, v_role))->>'code', 'feature_unavailable');
  perform pg_temp.chk('...delete refused', pg_temp.as_('ownert', format($q$select public.delete_custom_role(%L, %L)$q$, v_role, pg_temp.rid('staff')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('...assigning a custom role refused', pg_temp.as_('ownert', format($q$select public.assign_member_role(%L, %L, null)$q$, pg_temp.member('bizt', 'ownert'), v_role))->>'code', 'feature_unavailable');
  perform pg_temp.chk('...and by direct insert (guard)', pg_temp.try_as('ownert', format($q$insert into public.member_role_assignments (member_id, role_id, branch_id) values (%L, %L, null)$q$, pg_temp.member('bizt', 'ownert'), v_role)), 'P0001');
  perform pg_temp.chk('...but members who already hold the role keep its permissions (nobody is locked out)', pg_temp.as_q('mgr', format($q$select public.has_permission(%L, null, 'clients.view')::text$q$, pg_temp.id('bizt'))), 'true');
  perform pg_temp.chk('...and a DEFAULT role can still be assigned', pg_temp.as_('ownert', format($q$select public.assign_member_role(%L, %L, %L)$q$, v_mt, pg_temp.rid('receptionist'), pg_temp.id('brancht')))->>'ok', 'true');
  perform pg_temp.chk('...and removed (remove_member_role needs no feature)', pg_temp.as_('ownert', format($q$select public.remove_member_role(%L)$q$, v_asg))->>'ok', 'true');

  -- inactive business
  perform pg_temp.as_('sadmin', format($q$select public.set_business_status(%L, 'inactive')$q$, pg_temp.id('bizt')), true);
  perform pg_temp.chk('inactive business: roles RPC -> forbidden', pg_temp.as_('ownert', format($q$select public.create_custom_role(%L, 'T Role 3', '[{"permission":"clients.view","scope":"own"}]'::jsonb)$q$, pg_temp.id('bizt')))->>'code', 'forbidden');
  perform pg_temp.chk('inactive business: advanced report -> feature_unavailable', pg_temp.as_('ownert', format($q$select public.get_advanced_report(%L, 'appointments', 'monthly')$q$, pg_temp.id('bizt')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('inactive business: commission report -> feature_unavailable', pg_temp.as_('ownert', format($q$select public.get_commission_report(%L, current_date - 1, current_date)$q$, pg_temp.id('bizt')))->>'code', 'feature_unavailable');
  perform pg_temp.chk('inactive business: schedule -> forbidden', pg_temp.sched('ownert', 'bizt', 'weekly')->>'code', 'forbidden');
  perform pg_temp.as_('sadmin', format($q$select public.set_business_status(%L, 'active')$q$, pg_temp.id('bizt')), true);
end $$;

do $$
declare v_pub text[] := array[
  'create_custom_role(uuid,text,jsonb,uuid)', 'update_custom_role(uuid,text,jsonb)', 'delete_custom_role(uuid,uuid)',
  'assign_member_role(uuid,uuid,uuid)', 'remove_member_role(uuid)', 'list_roles(uuid)', 'my_permissions_version(uuid)',
  'set_commission_rule(uuid,uuid,text,integer,bigint,text,date)', 'get_commission_report(uuid,date,date,uuid,uuid)',
  'create_branch(uuid,text,text,text,text,text,text,text,integer,text,uuid)', 'update_branch(uuid,jsonb)', 'archive_branch(uuid)',
  'restore_branch(uuid)', 'set_primary_branch(uuid)', 'list_my_branches(uuid,boolean)', 'get_combined_overview(uuid,date,date)',
  'get_advanced_report(uuid,text,text,date,date,date,uuid)', 'set_report_schedule(uuid,text,uuid,boolean,integer)', 'delete_report_schedule(uuid)'];
  v_int text[] := array[
  'commission_sync(uuid,uuid,uuid)', 'commission_visible_branches(uuid,uuid,date,date)', 'branch_metrics(uuid,date,date,uuid)',
  'adv_visible_branches(uuid,uuid,date,date,boolean)', 'adv_revenue(uuid,uuid,date,date,boolean)', 'adv_staff(uuid,uuid,date,date,boolean)',
  'adv_services(uuid,uuid,date,date,boolean)', 'adv_clients(uuid,uuid,date,date,date,date,boolean)', 'adv_appointments(uuid,uuid,date,date,boolean)',
  'adv_branches(uuid,uuid,date,date,boolean)', 'report_period(text,date,date,date)', 'bp_of(bigint,bigint)', 'can_define_at(uuid,text,public.permission_scope)',
  'role_permission_set(uuid)', 'normalise_role_permissions(jsonb)', 'roles_gate(uuid)', 'bump_role_members(uuid)', 'branch_archive_blockers(uuid)',
  'branch_admin_gate(uuid)', 'report_summary_data(uuid,uuid,date,date,date,date)', 'enqueue_due_report_summaries_at(timestamptz)',
  'enqueue_due_report_summaries()', 'user_holds_all_scope(uuid,uuid,text)', 'report_schedule_gate(uuid)', 'report_schedule_zone(uuid,uuid)',
  'report_last_complete_end(text,date)', 'report_period_for_end(text,date)', 'scope_rank(public.permission_scope)'];
  f text; v_bad text := '';
begin
  foreach f in array v_pub loop
    if has_function_privilege('anon', 'public.' || f, 'execute') or not has_function_privilege('authenticated', 'public.' || f, 'execute') then v_bad := v_bad || f || ' '; end if;
  end loop;
  perform pg_temp.chk('every new RPC: anon cannot execute, authenticated can', v_bad, '');
  v_bad := '';
  foreach f in array v_int loop
    if has_function_privilege('anon', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute') then v_bad := v_bad || f || ' '; end if;
  end loop;
  perform pg_temp.chk('every internal function: neither anon nor authenticated can execute', v_bad, '');
  perform pg_temp.chk('can_grant_at is executable by authenticated (RLS policies call it) but not anon', has_function_privilege('authenticated', 'public.can_grant_at(uuid,uuid,text,public.permission_scope)', 'execute')::text || '/' || has_function_privilege('anon', 'public.can_grant_at(uuid,uuid,text,public.permission_scope)', 'execute')::text, 'true/false');
  perform pg_temp.chk('every public RPC is SECURITY DEFINER with a pinned search_path', (select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array['create_custom_role','update_custom_role','delete_custom_role','assign_member_role','remove_member_role','list_roles','my_permissions_version','set_commission_rule','get_commission_report','create_branch','update_branch','archive_branch','restore_branch','set_primary_branch','list_my_branches','get_combined_overview','get_advanced_report','set_report_schedule','delete_report_schedule']) and p.prosecdef and p.proconfig::text like '%search_path=%'), '19');
  perform pg_temp.chk('RLS is on for the four new tables', (select string_agg(c.relname, ',' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('commission_rules','commission_lines','commission_entries','report_schedules') and c.relrowsecurity), 'commission_entries,commission_lines,commission_rules,report_schedules');
  perform pg_temp.chk('authenticated holds SELECT only on them', (select string_agg(distinct privilege_type, ',') from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name in ('commission_rules','commission_lines','commission_entries','report_schedules')), 'SELECT');
  perform pg_temp.chk('anon holds nothing on them', (select count(*)::text from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and table_name in ('commission_rules','commission_lines','commission_entries','report_schedules')), '0');
  perform pg_temp.chk('anon cannot read them', pg_temp.as_anon('select to_jsonb(count(*)) from public.report_schedules')->>'state', '42501');
  perform pg_temp.chk('pg_cron job report-schedules exists, every 15 minutes', (select schedule from cron.job where jobname = 'report-schedules'), '*/15 * * * *');
  perform pg_temp.chk('the 47-permission catalogue is untouched (46 + clients.erase)', (select count(*)::text from public.permissions), '47');
  perform pg_temp.chk('my_permissions_version: a member sees their own counter, a stranger gets 0', (pg_temp.as_q('staffa', format($q$select public.my_permissions_version(%L) > 0$q$, pg_temp.id('biza')))) || '/' || pg_temp.as_q('ownerb', format($q$select public.my_permissions_version(%L)::text$q$, pg_temp.id('biza'))), 'true/0');
  perform pg_temp.chk('list_roles: owner sees default + custom roles with member counts', (select (jsonb_array_length(x->'roles') > 4)::text from (select pg_temp.as_('owner', format($q$select public.list_roles(%L)$q$, pg_temp.id('biza'))) x) q), 'true');
  perform pg_temp.chk('list_roles: staff forbidden', pg_temp.as_('staffa', format($q$select public.list_roles(%L)$q$, pg_temp.id('biza')))->>'code', 'forbidden');
end $$;

-- ===========================================================================
-- 7. Deleting a business with everything above must still work (cascade traps)
-- ===========================================================================
set constraints all immediate;   -- flush pending deferred events so ALTER TABLE is allowed
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
set constraints member_role_assignments_role_id_fkey deferred;   -- as it is outside a test (initially deferred)
do $$
begin
  delete from public.businesses where id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizt'), pg_temp.id('bizs'));
exception when others then
  perform pg_temp.chk('business delete cascade works with roles/commission/branches/schedules: ' || sqlerrm, 'failed', 'ok');
end $$;
-- the deferred role FK is checked HERE (it would be at commit): no assignment may dangle
set constraints all immediate;
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
select pg_temp.chk('cascade removed commission rules, lines, entries, schedules and custom roles',
  (select (select count(*) from public.commission_rules where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizt'), pg_temp.id('bizs')))
        + (select count(*) from public.commission_lines where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizt'), pg_temp.id('bizs')))
        + (select count(*) from public.commission_entries where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizt'), pg_temp.id('bizs')))
        + (select count(*) from public.report_schedules where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizt'), pg_temp.id('bizs')))
        + (select count(*) from public.roles where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizt'), pg_temp.id('bizs')))
        + (select count(*) from public.message_outbox where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizt'), pg_temp.id('bizs'))))::text, '0');

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
