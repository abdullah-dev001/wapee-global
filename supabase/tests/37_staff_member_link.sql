-- Staff logins <-> staff profiles (migration 20261022090000): link / unlink RPC, the
-- direct-write guard, add-by-email-with-profile through claim (20261026100000), add_me_as_staff, removal
-- releasing the link, own scope + push recipients after linking.
--
--   supabase db query --linked -f supabase/tests/37_staff_member_link.sql
--
-- Plain SQL, own fixtures, rolled back. Every failure path asserts the STORED
-- member_id, not only the returned code.
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



-- fixtures: users
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('mgr'),('recep'),('staff'),('staff2'),('ownerb'),('invitee'),('invitee2')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lnk.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
            case when r.k = 'owner' then '{"full_name":"Olivia Owner"}'::jsonb else '{}'::jsonb end);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('Link Alpha','link-alpha','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('Link Beta','link-beta','US','USD','America/New_York','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
end $$;
insert into ids select 'bra', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into ids select 'brb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;

select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('biza', 'mgr', 'manager');
select pg_temp.add_member('biza', 'recep', 'receptionist');
select pg_temp.add_member('biza', 'staff', 'staff');
select pg_temp.add_member('biza', 'staff2', 'staff');
-- a member of ANOTHER business (to try a cross-business link)
select pg_temp.act_as(pg_temp.id('ownerb'));
select pg_temp.add_member('bizb', 'staff', 'staff');
insert into ids select 'm_b_staff', id from public.business_members where business_id = pg_temp.id('bizb') and user_id = pg_temp.id('staff');

-- staff profiles + one service + appointments
do $$
declare v_p uuid; v_fv uuid; v_svc uuid; v_c uuid;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('biza') order by version desc limit 1;
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('biza'), 'Profile One') returning id into v_p; insert into ids values ('p1', v_p);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_p, pg_temp.id('bra'), pg_temp.id('biza'));
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('biza'), 'Profile Two') returning id into v_p; insert into ids values ('p2', v_p);
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_p, pg_temp.id('bra'), pg_temp.id('biza'));
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('biza'), 'Profile Three') returning id into v_p; insert into ids values ('p3', v_p);
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('bizb'), 'Beta Profile') returning id into v_p; insert into ids values ('pb', v_p);
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('biza'), 'Cut', 30, 0) returning id into v_svc;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, pg_temp.id('bra'), pg_temp.id('biza'), 1000, true);
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (pg_temp.id('biza'), 'Cli', '+447700900991', pg_temp.id('bra')) returning id into v_c;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('biza'), pg_temp.id('bra'), v_c, v_svc, pg_temp.id('p1'), '2027-05-03 09:00+00', '2027-05-03 09:30+00', 30, 0, 'confirmed', 'dashboard', v_fv, 1000),
         (pg_temp.id('biza'), pg_temp.id('bra'), v_c, v_svc, pg_temp.id('p2'), '2027-05-03 10:00+00', '2027-05-03 10:30+00', 30, 0, 'confirmed', 'dashboard', v_fv, 1000);
end $$;

create or replace function pg_temp.member_of(p_staff text) returns text language sql as $$
  select member_id::text from public.staff_profiles where id = pg_temp.id(p_staff) $$;
create or replace function pg_temp.audit_n2(p_action text) returns int language sql as $$
  select count(*)::int from public.audit_logs where business_id = pg_temp.id('biza') and action = p_action $$;

-- ============ link_staff_member ============
do $$
declare v_m_staff text := pg_temp.member('biza', 'staff')::text;
begin
  perform pg_temp.chk('owner links profile one to the staff login: ok',
    pg_temp.as_('owner', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p1'), v_m_staff)) ->> 'ok', 'true');
  perform pg_temp.chk('...member_id is stored on the profile', pg_temp.member_of('p1'), v_m_staff);
  perform pg_temp.chk('...and audited as staff.linked', pg_temp.audit_n2('staff.linked')::text, '1');

  perform pg_temp.chk('the same login cannot own a second profile: member_already_linked',
    pg_temp.as_('owner', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p2'), v_m_staff)) ->> 'code', 'member_already_linked');
  perform pg_temp.chk('...the second profile stayed unlinked and the first stayed linked',
    coalesce(pg_temp.member_of('p2'), 'null') || '/' || pg_temp.member_of('p1'), 'null/' || v_m_staff);

  perform pg_temp.chk('a login of ANOTHER business is refused: member_not_found',
    pg_temp.as_('owner', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p2'), pg_temp.id('m_b_staff'))) ->> 'code', 'member_not_found');
  perform pg_temp.chk('...nothing stored', coalesce(pg_temp.member_of('p2'), 'null'), 'null');

  perform pg_temp.chk('a staff profile of another business is refused for the owner of this one',
    pg_temp.as_('owner', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('pb'), v_m_staff)) ->> 'code', 'forbidden');
  perform pg_temp.chk('...and the other business owner cannot link THIS business''s profile',
    pg_temp.as_('ownerb', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p2'), v_m_staff)) ->> 'code', 'forbidden');
  perform pg_temp.chk('unknown profile: not_found',
    pg_temp.as_('owner', format($q$select public.link_staff_member(%L, %L)$q$, gen_random_uuid(), v_m_staff)) ->> 'code', 'not_found');

  perform pg_temp.chk('receptionist cannot link (no staff.manage)',
    pg_temp.as_('recep', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p2'), pg_temp.member('biza', 'staff2')::text)) ->> 'code', 'forbidden');
  perform pg_temp.chk('staff cannot link either',
    pg_temp.as_('staff', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p2'), pg_temp.member('biza', 'staff2')::text)) ->> 'code', 'forbidden');
  perform pg_temp.chk('anon is refused (42501)',
    pg_temp.as_anon(format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p2'), v_m_staff)) ->> 'state', '42501');
  perform pg_temp.chk('...none of the refusals changed the profiles', coalesce(pg_temp.member_of('p2'), 'null') || '/' || pg_temp.member_of('p1'), 'null/' || v_m_staff);

  perform pg_temp.chk('manager re-links profile two to staff2: ok',
    pg_temp.as_('mgr', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p2'), pg_temp.member('biza', 'staff2')::text)) ->> 'ok', 'true');
  perform pg_temp.chk('...stored', pg_temp.member_of('p2'), pg_temp.member('biza', 'staff2')::text);
  perform pg_temp.chk('same link again is a no-op (changed=false), not a second audit row',
    (pg_temp.as_('mgr', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p2'), pg_temp.member('biza', 'staff2')::text)) ->> 'changed') || '/' || pg_temp.audit_n2('staff.linked'), 'false/2');

  perform pg_temp.chk('manager unlinks profile two: ok',
    pg_temp.as_('mgr', format($q$select public.link_staff_member(%L, null)$q$, pg_temp.id('p2'))) ->> 'ok', 'true');
  perform pg_temp.chk('...member_id is null and staff.unlinked is audited', coalesce(pg_temp.member_of('p2'), 'null') || '/' || pg_temp.audit_n2('staff.unlinked'), 'null/1');
end $$;

-- ============ the column is closed to direct writes ============
do $$
begin
  perform pg_temp.chk('direct UPDATE of member_id as an authenticated owner is refused (23514)',
    pg_temp.try_as('owner', format($q$update public.staff_profiles set member_id = %L where id = %L$q$, pg_temp.member('biza', 'staff2'), pg_temp.id('p3'))), '23514');
  perform pg_temp.chk('direct INSERT with a member_id is refused (23514)',
    pg_temp.try_as('owner', format($q$insert into public.staff_profiles (business_id, display_name, member_id) values (%L, 'Sneaky', %L)$q$, pg_temp.id('biza'), pg_temp.member('biza', 'staff2'))), '23514');
  perform pg_temp.chk('...the profile did not change', coalesce(pg_temp.member_of('p3'), 'null'), 'null');
  perform pg_temp.chk('an ordinary profile edit (no member_id) is still allowed',
    pg_temp.try_as('owner', format($q$update public.staff_profiles set job_title = 'Barber' where id = %L$q$, pg_temp.id('p3'))), 'ok');
  perform pg_temp.chk('postgres / service paths can still write it (fixtures, FK SET NULL)',
    pg_temp.try(format($q$update public.staff_profiles set member_id = %L where id = %L$q$, pg_temp.member('biza', 'staff2'), pg_temp.id('p3'))), 'ok');
  perform pg_temp.try(format($q$update public.staff_profiles set member_id = null where id = %L$q$, pg_temp.id('p3')));
end $$;

-- ============ add by email with a staff profile (20261026100000) ============
do $$
declare v_role text := (select id::text from public.roles where business_id is null and key = 'staff');
        v_inv jsonb; v_mid text;
begin
  v_inv := pg_temp.as_('owner', format($q$select public.add_member_by_email(%L, 'lnk.invitee@example.com', %L, null, %L)$q$, pg_temp.id('biza'), v_role, pg_temp.id('p3')));
  v_mid := v_inv ->> 'member_id';
  perform pg_temp.chk('add with a staff profile: ok', v_inv ->> 'ok', 'true');
  perform pg_temp.chk('...the profile is linked to the PENDING member row', pg_temp.member_of('p3'), v_mid);
  perform pg_temp.chk('...the pending row has status invited', (select status::text from public.business_members where id = v_mid::uuid), 'invited');
  perform set_config('lnk.member', v_mid, true);

  perform pg_temp.chk('adding someone else with an already-linked profile is refused (staff_has_login)',
    pg_temp.as_('owner', format($q$select public.add_member_by_email(%L, 'lnk.invitee2@example.com', %L, null, %L)$q$, pg_temp.id('biza'), v_role, pg_temp.id('p3'))) ->> 'code', 'staff_has_login');
  perform pg_temp.chk('adding with a profile of ANOTHER business is refused (unknown_staff)',
    pg_temp.as_('owner', format($q$select public.add_member_by_email(%L, 'lnk.invitee2@example.com', %L, null, %L)$q$, pg_temp.id('biza'), v_role, pg_temp.id('pb'))) ->> 'code', 'unknown_staff');
  perform pg_temp.chk('...neither attempt created a pending row for invitee2',
    (select count(*)::text from public.business_members where business_id = pg_temp.id('biza') and invited_email = 'lnk.invitee2@example.com'), '0');
  perform pg_temp.chk('an add WITHOUT a profile still works',
    pg_temp.as_('owner', format($q$select public.add_member_by_email(%L, 'lnk.invitee2@example.com', %L)$q$, pg_temp.id('biza'), v_role)) ->> 'ok', 'true');
end $$;

-- the invitee signs in with that (verified) email: joined, and the person now owns the profile
do $$
declare v_res jsonb;
begin
  v_res := pg_temp.as_('invitee', 'select public.claim_pending_memberships()');
  perform pg_temp.chk('claim joins the business', v_res -> 'joined' ->> 0, pg_temp.id('biza')::text);
  perform pg_temp.chk('...member is active and still linked to the same profile',
    (select status::text from public.business_members where id = current_setting('lnk.member')::uuid) || '/' || pg_temp.member_of('p3'), 'active/' || current_setting('lnk.member'));
  perform pg_temp.act_as(pg_temp.id('invitee')); set local role authenticated;
  perform pg_temp.chk('is_own_staff_profile is true for the invitee on that profile', public.is_own_staff_profile(pg_temp.id('p3'))::text, 'true');
  reset role;
end $$;

-- re-adding with a different profile releases the earlier one; cancelling releases the link
do $$
declare v_role text := (select id::text from public.roles where business_id is null and key = 'staff');
        v_inv jsonb; v_mid text;
begin
  insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('biza'), 'Profile Four') returning id into v_mid;  -- reuse var as uuid text
  insert into ids values ('p4', v_mid::uuid);
  v_inv := pg_temp.as_('owner', format($q$select public.add_member_by_email(%L, 'lnk.invitee2@example.com', %L, null, %L)$q$, pg_temp.id('biza'), v_role, pg_temp.id('p4')));
  perform pg_temp.chk('re-add (pending row) linking profile four: linked to the pending member', pg_temp.member_of('p4'), v_inv ->> 'member_id');
  perform pg_temp.chk('revoke_invite releases the link',
    (pg_temp.as_('owner', format($q$select public.revoke_invite(%L)$q$, v_inv ->> 'member_id')) ->> 'ok') || '/' || coalesce(pg_temp.member_of('p4'), 'null'), 'true/null');
end $$;

-- removing an active member releases the profile
do $$
begin
  perform pg_temp.chk('remove_member (invitee) releases profile three',
    (pg_temp.as_('owner', format($q$select public.remove_member(%L)$q$, current_setting('lnk.member'))) ->> 'ok') || '/' || coalesce(pg_temp.member_of('p3'), 'null'), 'true/null');
end $$;

-- ============ add_me_as_staff ============
do $$
declare r jsonb; v_staff uuid;
begin
  r := pg_temp.as_('owner', format($q$select public.add_me_as_staff(%L)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('owner: add_me_as_staff ok', r ->> 'ok', 'true');
  v_staff := (r ->> 'staff_id')::uuid;
  perform pg_temp.chk('...stored name comes from the profile, email from the account',
    (select display_name || '/' || email::text from public.staff_profiles where id = v_staff), 'Olivia Owner/lnk.owner@example.com');
  perform pg_temp.chk('...active + bookable online + linked to the owner membership',
    (select (is_active and is_bookable_online)::text || '/' || (member_id = pg_temp.member('biza', 'owner'))::text from public.staff_profiles where id = v_staff), 'true/true');
  perform pg_temp.chk('...assigned to the primary branch only',
    (select string_agg(branch_id::text, ',') from public.staff_branches where staff_id = v_staff), pg_temp.id('bra')::text);
  perform pg_temp.chk('...no services were assigned (a separate setup step)',
    (select count(*)::text from public.service_staff where staff_id = v_staff), '0');
  perform pg_temp.chk('...audited as staff.self_added', pg_temp.audit_n2('staff.self_added')::text, '1');

  r := pg_temp.as_('owner', format($q$select public.add_me_as_staff(%L)$q$, pg_temp.id('biza')));
  perform pg_temp.chk('second call: already_staff with the same id', (r ->> 'code') || '/' || (r ->> 'staff_id'), 'already_staff/' || v_staff::text);
  perform pg_temp.chk('...still ONE profile for that membership',
    (select count(*)::text from public.staff_profiles where member_id = pg_temp.member('biza', 'owner') and deleted_at is null), '1');

  perform pg_temp.chk('receptionist: forbidden',
    pg_temp.as_('recep', format($q$select public.add_me_as_staff(%L)$q$, pg_temp.id('biza'))) ->> 'code', 'forbidden');
  perform pg_temp.chk('someone from another business: forbidden',
    pg_temp.as_('ownerb', format($q$select public.add_me_as_staff(%L)$q$, pg_temp.id('biza'))) ->> 'code', 'forbidden');
  perform pg_temp.chk('a branch of another business: branch_not_found',
    pg_temp.as_('mgr', format($q$select public.add_me_as_staff(%L, %L)$q$, pg_temp.id('biza'), pg_temp.id('brb'))) ->> 'code', 'branch_not_found');
  perform pg_temp.chk('anon is refused (42501)',
    pg_temp.as_anon(format($q$select public.add_me_as_staff(%L)$q$, pg_temp.id('biza'))) ->> 'state', '42501');
end $$;

-- plan cap: a Solo business (1 active staff per location) refuses the second one as a CODE and writes nothing
do $$
declare r jsonb;
begin
  update public.business_subscriptions set plan = 'solo', status = 'active' where business_id = pg_temp.id('bizb');
  insert into public.staff_branches (staff_id, branch_id, business_id) values (pg_temp.id('pb'), pg_temp.id('brb'), pg_temp.id('bizb'));
  r := pg_temp.as_('ownerb', format($q$select public.add_me_as_staff(%L)$q$, pg_temp.id('bizb')));
  perform pg_temp.chk('solo plan at its staff cap: add_me_as_staff returns staff_cap_reached', r ->> 'code', 'staff_cap_reached');
  perform pg_temp.chk('...no profile was created for the owner',
    (select count(*)::text from public.staff_profiles where business_id = pg_temp.id('bizb')), '1');
  perform pg_temp.chk('...and no audit row', (select count(*)::text from public.audit_logs where business_id = pg_temp.id('bizb') and action = 'staff.self_added'), '0');
end $$;

-- own scope after linking: a Staff login sees ONLY its own appointments; push recipients include them
do $$
declare v_n text; v_push int;
begin
  -- profile one is linked to 'staff' (fixture state after the unlink steps above): re-link as owner
  perform pg_temp.as_('owner', format($q$select public.link_staff_member(%L, %L)$q$, pg_temp.id('p1'), pg_temp.member('biza', 'staff')::text));
  v_n := pg_temp.as_q('staff', 'select count(*)::text from public.appointments');
  perform pg_temp.chk('staff login sees only its own appointment (1 of 2)', v_n, '1');
  perform pg_temp.chk('...an unlinked staff login (staff2) sees none',
    pg_temp.as_q('staff2', 'select count(*)::text from public.appointments'), '0');
  insert into public.push_tokens (user_id, token, platform) values (pg_temp.id('staff'), 'ExponentPushToken[lnktesttoken0001]', 'android');
  select count(*) into v_push from public.push_recipient_users(pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('p1'), 'appointments.view', null) u where u = pg_temp.id('staff');
  perform pg_temp.chk('push recipients for a booking with profile one include the linked staff login', v_push::text, '1');
  select count(*) into v_push from public.push_recipient_users(pg_temp.id('biza'), pg_temp.id('bra'), pg_temp.id('p2'), 'appointments.view', null) u where u = pg_temp.id('staff');
  perform pg_temp.chk('...and do NOT include them for another profile''s booking', v_push::text, '0');
end $$;

-- the new triggers survive a tenant delete
do $$
begin
  set constraints all immediate;
  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete from businesses cascades with the new triggers in place',
    pg_temp.try(format($q$delete from public.businesses where id = %L$q$, pg_temp.id('biza'))), 'ok');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
