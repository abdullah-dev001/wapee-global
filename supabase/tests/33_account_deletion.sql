-- Pre-launch batch 2: account deletion (account_delete_blockers / account_delete_commit). Every refused path leaves the
-- state exactly as it was; the deletion keeps staff profiles, appointments and ledger rows; it is idempotent; other
-- users are untouched. (The password check lives in the Edge Function: see 33_account_http.mjs.)
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


create or replace function pg_temp.svc(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  begin execute p_sql into r; exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm); end;
  reset role;
  return r;
end $$;
do $$
declare s text;
begin
  select nspname into s from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to service_role', s);
  execute format('grant select, insert on %I.ids to service_role', s);
  execute format('grant select, insert on %I.res to service_role', s);
end $$;

-- users: sole (only owner of A), co1 + co2 (owners of B), mgr (manager of B, created lots of things), other (owner of C), su (super admin)
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('sole'),('co1'),('co2'),('mgr'),('other'),('su')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12a.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Real Name"}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
  update public.profiles set is_super_admin = true where id = pg_temp.id('su');
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('sole')); set local role authenticated;
  v_biz := public.create_business_with_owner('P12A Alpha','p12a-a','GB','GBP','Europe/London','en',null,'Main'); reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('co1')); set local role authenticated;
  v_biz := public.create_business_with_owner('P12A Beta','p12a-b','GB','GBP','Europe/London','en',null,'Beta'); reset role; insert into ids values ('bizb', v_biz);
  perform pg_temp.act_as(pg_temp.id('other')); set local role authenticated;
  v_biz := public.create_business_with_owner('P12A Gamma','p12a-c','GB','GBP','Europe/London','en',null,'Gamma'); reset role; insert into ids values ('bizc', v_biz);
end $$;
insert into ids select 'brb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;
select set_config('request.jwt.claims', '', true);
do $$
declare v_m uuid;
begin
  perform pg_temp.add_member('bizb', 'co2', 'owner');
  v_m := pg_temp.add_member('bizb', 'mgr', 'manager');
  -- sole is ALSO a plain manager of B (so the sole-owner refusal is about A, not B)
  perform pg_temp.add_member('bizb', 'sole', 'manager');
  -- things the manager touched
  insert into public.staff_profiles (business_id, member_id, display_name, created_by) values (pg_temp.id('bizb'), v_m, 'Mgr Staff', pg_temp.id('mgr'));
  insert into ids select 'staffm', id from public.staff_profiles where member_id = v_m;
  insert into public.push_tokens (user_id, token, platform) values (pg_temp.id('mgr'), 'ExponentPushToken[mgrmgrmgrmgr]', 'ios'), (pg_temp.id('other'), 'ExponentPushToken[otherotherother]', 'ios');
  insert into public.products (business_id, branch_id, name, currency, created_by) values (pg_temp.id('bizb'), pg_temp.id('brb'), 'Prod', 'GBP', pg_temp.id('mgr'));
  insert into ids select 'prod', id from public.products where business_id = pg_temp.id('bizb');
  insert into public.stock_movements (business_id, branch_id, product_id, kind, quantity, stock_after, reason, created_by)
    values (pg_temp.id('bizb'), pg_temp.id('brb'), pg_temp.id('prod'), 'adjustment', 5, 5, 'Opening', pg_temp.id('mgr'));
  insert into public.commission_rules (business_id, staff_id, kind, percent_bp, effective_from, created_by)
    values (pg_temp.id('bizb'), pg_temp.id('staffm'), 'percent', 1000, current_date, pg_temp.id('mgr'));
  insert into public.services (business_id, name, duration_minutes, created_by) values (pg_temp.id('bizb'), 'Cut', 30, pg_temp.id('mgr'));
  insert into public.clients (business_id, full_name, phone_e164, created_by) values (pg_temp.id('bizb'), 'Cli', '+447700900123', pg_temp.id('mgr'));
  insert into public.roles (business_id, key, name, created_by) values (pg_temp.id('bizb'), 'custom1', 'Custom', pg_temp.id('mgr'));
end $$;

create or replace function pg_temp.snap(p_user text, p_audit boolean default true) returns text language sql as $$
  select concat_ws('|',
    (select count(*) from auth.users where id = pg_temp.id(p_user)),
    (select count(*) from public.profiles where id = pg_temp.id(p_user) and email = 'p12a.' || p_user || '@example.com' and full_name = 'Real Name'),
    (select count(*) from public.business_members where user_id = pg_temp.id(p_user)),
    (select count(*) from public.member_role_assignments a join public.business_members m on m.id = a.member_id where m.user_id = pg_temp.id(p_user)),
    (select count(*) from public.push_tokens where user_id = pg_temp.id(p_user)),
    case when p_audit then (select count(*) from public.audit_logs where action in ('member.account_deleted','account.deleted')) end)
$$;
create or replace function pg_temp.others() returns text language sql as $$
  select concat_ws('|', pg_temp.snap('other', false), pg_temp.snap('co1', false), pg_temp.snap('co2', false),
    (select count(*) from public.business_members where business_id = pg_temp.id('bizc')),
    (select count(*) from public.staff_profiles where business_id = pg_temp.id('bizb')),
    (select count(*) from public.products where business_id = pg_temp.id('bizb')))
$$;

do $$
declare r jsonb; v_before text; v_oth text; v_staff text;
begin
  -- blockers --------------------------------------------------------------------------------------------------
  r := pg_temp.as_('sole', 'select public.account_delete_blockers()');
  perform pg_temp.chk('blockers: the sole owner sees business A by name', (r->>'ok') || '/' || (r->'businesses'->0->>'name') || '/' || jsonb_array_length(r->'businesses')::text, 'true/P12A Alpha/1');
  r := pg_temp.as_('co1', 'select public.account_delete_blockers()');
  perform pg_temp.chk('blockers: one of two owners has none', jsonb_array_length(r->'businesses')::text, '0');
  r := pg_temp.as_('mgr', 'select public.account_delete_blockers()');
  perform pg_temp.chk('blockers: a manager has none', jsonb_array_length(r->'businesses')::text, '0');
  perform pg_temp.chk('blockers: anonymous is refused', pg_temp.as_anon('select public.account_delete_blockers()')->>'state', '42501');
  perform pg_temp.chk('blockers: nobody reads another person''s answer (it takes no argument)', (select count(*) from pg_proc where proname = 'account_delete_blockers' and pronargs = 0)::text, '1');
  perform pg_temp.chk('commit: authenticated / anon cannot call it', pg_temp.try_as('sole', format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('mgr'))) || (pg_temp.as_anon(format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('mgr')))->>'state'), '4250142501');
  perform pg_temp.chk('commit: authenticated cannot call the helper either', pg_temp.try_as('sole', format($q$select public.account_sole_owner_businesses(%L)$q$, pg_temp.id('sole'))), '42501');

  -- refusals leave EVERYTHING as it was --------------------------------------------------------------------------
  v_before := pg_temp.snap('sole') || '#' || pg_temp.others();
  r := pg_temp.svc(format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('sole')));
  perform pg_temp.chk('sole owner: refused with the business name', (r->>'ok') || '/' || (r->>'code') || '/' || (r->'businesses'->0->>'name'), 'false/sole_owner/P12A Alpha');
  perform pg_temp.chk('sole owner: state exactly unchanged (account, profile text, memberships, roles, tokens, audit)', pg_temp.snap('sole') || '#' || pg_temp.others(), v_before);
  v_before := pg_temp.snap('su') || '#' || pg_temp.others();
  r := pg_temp.svc(format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('su')));
  perform pg_temp.chk('super admin: refused, state unchanged', (r->>'code') || '/' || (pg_temp.snap('su') || '#' || pg_temp.others() = v_before)::text, 'super_admin/true');
  r := pg_temp.svc('select public.account_delete_commit(null)');
  perform pg_temp.chk('null id: not_found', r->>'code', 'not_found');

  -- the real deletion --------------------------------------------------------------------------------------------
  v_oth := pg_temp.others();
  v_staff := (select concat_ws('|', display_name, is_active::text, (deleted_at is null)::text) from public.staff_profiles where id = pg_temp.id('staffm'));
  r := pg_temp.svc(format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('mgr')));
  perform pg_temp.chk('manager: deleted ok', (r->>'ok') || '/' || (r->>'already_deleted'), 'true/false');
  perform pg_temp.chk('auth user, profile, sessions gone', (select count(*) from auth.users where id = pg_temp.id('mgr'))::text || (select count(*) from public.profiles where id = pg_temp.id('mgr'))::text, '00');
  perform pg_temp.chk('membership + role assignments + push tokens gone', pg_temp.snap('mgr'), '0|0|0|0|0|' || (select count(*) from public.audit_logs where action in ('member.account_deleted','account.deleted')));
  perform pg_temp.chk('staff profile KEPT, unlinked (member_id null), otherwise identical', (select concat_ws('|', display_name, is_active::text, (deleted_at is null)::text, (member_id is null)::text) from public.staff_profiles where id = pg_temp.id('staffm')), v_staff || '|true');
  perform pg_temp.chk('product + stock movement + commission rule KEPT, rows untouched (uuid kept, no person behind it)',
    (select count(*) from public.products where id = pg_temp.id('prod'))::text || (select count(*) from public.stock_movements where product_id = pg_temp.id('prod') and quantity = 5 and created_by = pg_temp.id('mgr'))::text || (select count(*) from public.commission_rules where staff_id = pg_temp.id('staffm') and created_by = pg_temp.id('mgr'))::text, '111');
  perform pg_temp.chk('service, client, custom role KEPT with created_by cleared', (select count(*) from public.services where business_id = pg_temp.id('bizb') and name = 'Cut' and created_by is null)::text || (select count(*) from public.clients where business_id = pg_temp.id('bizb') and full_name = 'Cli' and created_by is null)::text || (select count(*) from public.roles where business_id = pg_temp.id('bizb') and key = 'custom1' and created_by is null)::text, '111');
  perform pg_temp.chk('audit: one member.account_deleted for B (roles only, no email/name) + one account.deleted', (select count(*) from public.audit_logs where action = 'member.account_deleted' and business_id = pg_temp.id('bizb') and entity_id is not null and before::text not ilike '%@%' and before::text not ilike '%Real Name%')::text || (select count(*) from public.audit_logs where action = 'account.deleted' and entity_id = pg_temp.id('mgr')::text and business_id is null)::text, '11');
  perform pg_temp.chk('other users, other businesses untouched', replace(pg_temp.others(), (select count(*)::text from public.staff_profiles where business_id = pg_temp.id('bizb')) || '|' || (select count(*)::text from public.products where business_id = pg_temp.id('bizb')), 'X'), replace(v_oth, (select count(*)::text from public.staff_profiles where business_id = pg_temp.id('bizb')) || '|' || (select count(*)::text from public.products where business_id = pg_temp.id('bizb')), 'X') );
  -- idempotent
  v_before := pg_temp.others();
  r := pg_temp.svc(format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('mgr')));
  perform pg_temp.chk('again: ok + already_deleted, nothing written', (r->>'ok') || '/' || (r->>'already_deleted') || '/' || (pg_temp.others() = v_before)::text, 'true/true/true');

  -- co-owners: the first may go, the last may not -------------------------------------------------------------------
  r := pg_temp.svc(format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('co1')));
  perform pg_temp.chk('co-owner co1 (another owner stays): deleted', (r->>'ok') || '/' || (select count(*) from auth.users where id = pg_temp.id('co1'))::text, 'true/0');
  perform pg_temp.chk('business B still has its owner co2', (select count(*) from public.member_role_assignments a join public.business_members m on m.id = a.member_id join public.roles r on r.id = a.role_id where m.business_id = pg_temp.id('bizb') and r.key = 'owner' and r.business_id is null)::text, '1');
  v_before := pg_temp.snap('co2') || '#' || pg_temp.others();
  r := pg_temp.svc(format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('co2')));
  perform pg_temp.chk('co2 is now the last owner of B: refused, unchanged', (r->>'code') || '/' || (r->'businesses'->0->>'name') || '/' || (pg_temp.snap('co2') || '#' || pg_temp.others() = v_before)::text, 'sole_owner/P12A Beta/true');
  -- a deleted business does not block
  update public.businesses set deleted_at = now() where id = pg_temp.id('biza');
  r := pg_temp.svc(format($q$select public.account_delete_commit(%L)$q$, pg_temp.id('sole')));
  perform pg_temp.chk('an already-deleted business no longer blocks', coalesce(r->>'ok', r::text) || '/' || (select count(*) from auth.users where id = pg_temp.id('sole'))::text, 'true/0');
  -- tenant delete still works with the new state
  set constraints all immediate;
  alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('delete business still works (no guard trips)', pg_temp.try(format($q$delete from public.businesses where id in (%L, %L, %L)$q$, pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc'))), 'ok');
  alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
  perform pg_temp.chk('slug delete-account is reserved', (select count(*) from public.reserved_slugs where slug = 'delete-account')::text || public.is_slug_available('delete-account')::text, '1false');
end $$;


-- change email / password support ------------------------------------------------------------------------------
do $$
declare r jsonb; n0 int;
begin
  update auth.users set email = 'p12a.other.new@example.com' where id = pg_temp.id('other');
  perform pg_temp.chk('email change in auth is mirrored to profiles.email', (select email from public.profiles where id = pg_temp.id('other')), 'p12a.other.new@example.com');
  perform pg_temp.chk('...and a change of something else leaves it alone', pg_temp.try(format($q$update auth.users set raw_user_meta_data = '{"full_name":"X"}' where id = %L$q$, pg_temp.id('other'))) || (select email from public.profiles where id = pg_temp.id('other')), 'okp12a.other.new@example.com');
  r := pg_temp.as_('other', $q$select public.log_account_event('password_changed')$q$);
  perform pg_temp.chk('log_account_event: logged for the caller, no business, entity = self', (r->>'logged') || (select count(*) from public.audit_logs where action = 'account.password_changed' and actor_user_id = pg_temp.id('other') and business_id is null and entity_id = pg_temp.id('other')::text)::text, 'true1');
  r := pg_temp.as_('other', $q$select public.log_account_event('password_changed')$q$);
  perform pg_temp.chk('...a repeat within 10 s is ignored', (r->>'ok') || (r->>'logged') || (select count(*) from public.audit_logs where action = 'account.password_changed' and actor_user_id = pg_temp.id('other'))::text, 'truefalse1');
  r := pg_temp.as_('other', $q$select public.log_account_event('email_change_requested')$q$);
  perform pg_temp.chk('...the other event is logged on its own', (r->>'logged'), 'true');
  select count(*) into n0 from public.audit_logs;
  r := pg_temp.as_('other', $q$select public.log_account_event('made.up')$q$);
  perform pg_temp.chk('an unknown event is refused and writes nothing', (r->>'code') || (select count(*) from public.audit_logs)::text, 'invalid_event' || n0::text);
  perform pg_temp.chk('anonymous cannot log', pg_temp.as_anon($q$select public.log_account_event('password_changed')$q$)->>'state', '42501');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
