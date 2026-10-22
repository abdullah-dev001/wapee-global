-- Setup checklist dismissal (migration 20261022110000): dismiss_setup_checklist permission
-- boundary, first-dismissal-wins, tenant isolation, and that nothing changes on a refusal.
--
--   supabase db query --linked -f supabase/tests/39_setup_checklist.sql
--
-- Plain SQL, own fixtures, rolled back. (The backfill of existing businesses ran in the migration
-- itself and cannot be exercised in a rolled-back fixture; it was checked by count after applying.)
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



do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('mgr'),('recep'),('staff'),('ownerb')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sc.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('Setup Alpha','setup-alpha','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('Setup Beta','setup-beta','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);
end $$;
select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('biza', 'mgr', 'manager');
select pg_temp.add_member('biza', 'recep', 'receptionist');
select pg_temp.add_member('biza', 'staff', 'staff');

create or replace function pg_temp.stamp(p_biz text) returns text language sql as $$
  select coalesce(setup_checklist_dismissed_at::text, 'null') from public.businesses where id = pg_temp.id(p_biz) $$;

-- ============ a brand-new business shows the checklist ============
select pg_temp.chk('a new business is not dismissed', pg_temp.stamp('biza'), 'null');

-- ============ who may dismiss ============
select pg_temp.chk('receptionist (no settings.booking): forbidden', pg_temp.as_('recep', format($q$select public.dismiss_setup_checklist(%L)$q$, pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('staff: forbidden', pg_temp.as_('staff', format($q$select public.dismiss_setup_checklist(%L)$q$, pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('another business''s owner: forbidden', pg_temp.as_('ownerb', format($q$select public.dismiss_setup_checklist(%L)$q$, pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('anon is refused (42501)', pg_temp.as_anon(format($q$select public.dismiss_setup_checklist(%L)$q$, pg_temp.id('biza'))) ->> 'state', '42501');
select pg_temp.chk('...none of those changed the business', pg_temp.stamp('biza'), 'null');
select pg_temp.chk('...nor the other business', pg_temp.stamp('bizb'), 'null');
select pg_temp.chk('an unknown business id: forbidden (no existence oracle)', pg_temp.as_('owner', format($q$select public.dismiss_setup_checklist(%L)$q$, gen_random_uuid())) ->> 'code', 'forbidden');

-- ============ a manager may; the first dismissal wins ============
select pg_temp.chk('manager (settings.booking): ok', pg_temp.as_('mgr', format($q$select public.dismiss_setup_checklist(%L)$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('...stored for the business', (pg_temp.stamp('biza') <> 'null')::text, 'true');
do $$
declare v_first text := pg_temp.stamp('biza');
begin
  perform pg_temp.chk('...the other business is untouched', pg_temp.stamp('bizb'), 'null');
  perform pg_temp.chk('owner dismissing again keeps the original time', (pg_temp.as_('owner', format($q$select public.dismiss_setup_checklist(%L)$q$, pg_temp.id('biza'))) ->> 'ok') || '/' || (pg_temp.stamp('biza') = v_first)::text, 'true/true');
end $$;

-- ============ a soft-deleted business is not found ============
update public.businesses set deleted_at = now() where id = pg_temp.id('bizb');
select pg_temp.chk('a deleted business: refused and unchanged', coalesce(pg_temp.as_('ownerb', format($q$select public.dismiss_setup_checklist(%L)$q$, pg_temp.id('bizb'))) ->> 'code', 'none') || '/' || pg_temp.stamp('bizb'), 'forbidden/null');

-- ============ members may READ the column (the app shows/hides the card from it) ============
select pg_temp.chk('a member reads the flag through RLS', pg_temp.as_q('staff', format($q$select (setup_checklist_dismissed_at is not null)::text from public.businesses where id = %L$q$, pg_temp.id('biza'))), 'true');

-- the tenant delete still works with the column in place
do $$
begin
  set constraints all immediate;
  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete from businesses is unaffected', pg_temp.try(format($q$delete from public.businesses where id = %L$q$, pg_temp.id('biza'))), 'ok');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
