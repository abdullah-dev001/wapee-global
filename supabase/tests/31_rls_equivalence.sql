-- Phase 11A: the RLS performance rewrite (migration 20261016130000) must not change WHO SEES WHAT.
--
--   supabase db query --linked -f supabase/tests/31_rls_equivalence.sql
--
-- For every rewritten SELECT policy and every kind of caller, the ids visible through the NEW policy (as the
-- user, with RLS) must equal the ids the OLD policy expression selects (evaluated as the table owner with the same
-- JWT claims). Callers: Owner (all branches), Manager of branch 1 only, Receptionist of branch 2 only, a
-- business-wide Manager, Staff at own scope, an Owner of an INACTIVE business, an Owner of another business, a
-- super admin (aal2), a super admin at aal1, a member with no role.
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

-- run a jsonb-returning statement as service_role (what the Edge Functions use)
create or replace function pg_temp.svc(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  begin execute p_sql into r; exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm); end;
  reset role;
  return r;
end $$;
create or replace function pg_temp.uid_of(p_key text) returns uuid language sql as $$ select pg_temp.id(p_key) $$;
do $$
declare s text;
begin
  select nspname into s from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to service_role', s);
  execute format('grant select, insert on %I.ids to service_role', s);
  execute format('grant select, insert on %I.res to service_role', s);
end $$;

create or replace function pg_temp.old_ids(p_user text, p_table text, p_pred text, p_aal2 boolean default false) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act_as(pg_temp.id(p_user), p_aal2);
  execute format('select coalesce(md5(string_agg(%6$s, '','' order by %6$s)), ''none'') from public.%1$I where business_id in (%2$L, %3$L, %4$L) and (%5$s)', p_table, pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc'), p_pred, case when p_table = 'clients' then 'id::text' else p_table || '::text' end) into v;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
create or replace function pg_temp.new_ids(p_user text, p_table text, p_aal2 boolean default false) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act_as(pg_temp.id(p_user), p_aal2);
  set local role authenticated;
  begin
    execute format('select coalesce(md5(string_agg(%5$s, '','' order by %5$s)), ''none'') from public.%1$I where business_id in (%2$L, %3$L, %4$L)', p_table, pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc'), case when p_table = 'clients' then 'id::text' else p_table || '::text' end) into v;
  exception when others then reset role; return 'ERR:' || sqlstate; end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('mgr1'),('recep2'),('mgrall'),('staff'),('ownerc'),('ownerb'),('sadmin'),('norole')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p11e.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
  alter table public.profiles disable trigger profiles_enforce_guard;
  update public.profiles set is_super_admin = true where id = pg_temp.id('sadmin');
  alter table public.profiles enable trigger profiles_enforce_guard;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11E Alpha','p11e-a','GB','GBP','Europe/London','en',null,'Branch One'); reset role; insert into ids values ('biza', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11E Beta','p11e-b','GB','GBP','Europe/London','en',null,'Beta'); reset role; insert into ids values ('bizb', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerc')); set local role authenticated;
  v_biz := public.create_business_with_owner('P11E Gamma','p11e-c','GB','GBP','Europe/London','en',null,'Gamma'); reset role; insert into ids values ('bizc', v_biz);
end $$;
insert into ids select 'br1', id from public.branches where business_id = pg_temp.id('biza') and is_primary;
insert into ids select 'brb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary;
insert into ids select 'brc', id from public.branches where business_id = pg_temp.id('bizc') and is_primary;
do $$
declare v_br2 uuid; v_biz uuid := pg_temp.id('biza'); v_r jsonb;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_r := public.create_branch(v_biz, 'Branch Two', 'GB', 'GBP', 'Europe/London');
  reset role;
  insert into ids values ('br2', coalesce((v_r->>'branch_id')::uuid, (v_r->>'id')::uuid));
end $$;
select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('biza', 'mgr1', 'manager', 'br1');
select pg_temp.add_member('biza', 'recep2', 'receptionist', 'br2');
select pg_temp.add_member('biza', 'mgrall', 'manager');
select pg_temp.add_member('biza', 'staff', 'staff', 'br1');
insert into public.business_members (business_id, user_id, status, joined_at) values (pg_temp.id('biza'), pg_temp.id('norole'), 'active', now());
select set_config('request.jwt.claims', '', true);
update public.business_subscriptions set status = 'inactive' where business_id = pg_temp.id('bizc');

do $$
declare v_biz uuid := pg_temp.id('biza'); v_svc uuid; v_ann uuid; v_fv uuid; v_c uuid; k text; v_br uuid; v_inv jsonb; v_a uuid;
begin
  foreach k in array array['br1', 'br2'] loop
    v_br := pg_temp.id(k);
    insert into public.services (business_id, name, duration_minutes) values (v_biz, 'Cut ' || k, 60) returning id into v_svc; insert into ids values ('svc_' || k, v_svc);
    insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, v_br, v_biz, 4000, true);
    insert into public.staff_profiles (business_id, display_name, sort_order, member_id) values (v_biz, 'Staff ' || k, 1, case k when 'br1' then pg_temp.member('biza', 'staff') end) returning id into v_ann; insert into ids values ('stf_' || k, v_ann);
    insert into public.staff_branches (staff_id, branch_id, business_id) values (v_ann, v_br, v_biz);
    insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_ann, v_biz);
    select id into v_fv from public.form_versions where business_id = v_biz order by version desc limit 1;
    insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (v_biz, 'Client ' || k, case k when 'br1' then '+447700940001' else '+447700940002' end, v_br) returning id into v_c; insert into ids values ('cl_' || k, v_c);
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
      values (v_biz, v_br, v_c, v_svc, v_ann, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 60, 0, 'completed', 'dashboard', v_fv, 4000) returning id into v_a;
    insert into ids values ('ap_' || k, v_a);
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
      values (v_biz, v_br, v_c, v_svc, null, now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 60, 0, 'completed', 'dashboard', v_fv, 4000);
    v_inv := pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L, null, %L, '[{"description":"x","unit_price_minor":2000}]'::jsonb)$q$, v_br, v_c));
    perform pg_temp.issue('owner', (v_inv->>'invoice_id')::uuid);
    perform pg_temp.as_('owner', format($q$select public.add_payment(%L, 'cash', 500)$q$, (v_inv->>'invoice_id')::uuid));
    perform pg_temp.as_('owner', format($q$select public.create_credit_note(%L, 'goodwill', 300)$q$, (v_inv->>'invoice_id')::uuid));
    insert into public.messages (business_id, branch_id, appointment_id, channel, event, status) values (v_biz, v_br, v_a, 'email', 'reminder', 'sent');
  end loop;
  insert into public.messages (business_id, branch_id, channel, event, status) values (v_biz, null, 'email', 'reminder', 'sent');
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (v_biz, 'Orphan NoAppt', '+447700940003', null);
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (v_biz, 'NullBranch WithAppt', '+447700940004', null) returning id into v_c;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
    values (v_biz, pg_temp.id('br2'), v_c, pg_temp.id('svc_br2'), pg_temp.id('stf_br1'), now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 60, 0, 'completed', 'dashboard', v_fv, 4000);
  insert into public.clients (business_id, full_name, phone_e164) values (pg_temp.id('bizb'), 'Bob Beta', '+447700940009'), (pg_temp.id('bizc'), 'Gina Gamma', '+447700940010');
  insert into public.messages (business_id, branch_id, channel, event, status) values (pg_temp.id('bizb'), pg_temp.id('brb'), 'email', 'reminder', 'sent'), (pg_temp.id('bizc'), pg_temp.id('brc'), 'email', 'reminder', 'sent');
  perform set_config('request.jwt.claims', '', true);
end $$;

create temporary table spec (n serial, tbl text, pred text);
insert into spec (tbl, pred) values
 ('appointments', $p$(public.is_super_admin() OR (public.can(business_id, branch_id, 'appointments.view') AND (public.has_permission_at_branch_scope(business_id, branch_id, 'appointments.view') OR (staff_id IS NOT NULL AND public.is_own_staff_profile(staff_id)))))$p$),
 ('invoices', $p$(public.can(business_id, branch_id, 'invoices.view') AND public.has_permission_at_branch_scope(business_id, branch_id, 'invoices.view'))$p$),
 ('invoice_items', $p$(public.can(business_id, branch_id, 'invoices.view') AND public.has_permission_at_branch_scope(business_id, branch_id, 'invoices.view'))$p$),
 ('invoice_payments', $p$(public.can(business_id, branch_id, 'invoices.view') AND public.has_permission_at_branch_scope(business_id, branch_id, 'invoices.view'))$p$),
 ('credit_notes', $p$(public.can(business_id, branch_id, 'invoices.view') AND public.has_permission_at_branch_scope(business_id, branch_id, 'invoices.view'))$p$),
 ('messages', $p$(public.is_super_admin() OR public.can(business_id, branch_id, 'settings.booking'))$p$),
 ('clients', $p$(public.is_super_admin() OR public.client_in_scope(business_id, id, first_branch_id, 'clients.view') OR (public.can(business_id, NULL::uuid, 'clients.view') AND (EXISTS (SELECT 1 FROM public.appointments a WHERE ((a.client_id = clients.id) AND (a.deleted_at IS NULL) AND (a.staff_id IS NOT NULL) AND public.is_own_staff_profile(a.staff_id))))))$p$),
 ('services', $p$(public.is_member(business_id) OR public.is_super_admin())$p$),
 ('staff_profiles', $p$(public.is_member(business_id) OR public.is_super_admin())$p$),
 ('branches', $p$(public.is_member(business_id) OR public.is_super_admin())$p$),
 ('service_branches', $p$(public.is_member(business_id) OR public.is_super_admin())$p$),
 ('staff_branches', $p$(public.is_member(business_id) OR public.is_super_admin())$p$);

do $$
declare s record; u text; o text; n text; bad text := ''; total int := 0;
begin
  for s in select * from spec order by n loop
    for u in select unnest(array['owner','mgr1','recep2','mgrall','staff','ownerc','ownerb','norole']) loop
      o := pg_temp.old_ids(u, s.tbl, s.pred); n := pg_temp.new_ids(u, s.tbl); total := total + 1;
      if o is distinct from n then bad := bad || s.tbl || '/' || u || ' '; end if;
    end loop;
    o := pg_temp.old_ids('sadmin', s.tbl, s.pred, true); n := pg_temp.new_ids('sadmin', s.tbl, true); total := total + 1;
    if o is distinct from n then bad := bad || s.tbl || '/sadmin-aal2 '; end if;
    o := pg_temp.old_ids('sadmin', s.tbl, s.pred, false); n := pg_temp.new_ids('sadmin', s.tbl, false); total := total + 1;
    if o is distinct from n then bad := bad || s.tbl || '/sadmin-aal1 '; end if;
  end loop;
  -- clients_v carries its own copy of the clients_select rule: it must show exactly the rows the policy shows.
  for u in select unnest(array['owner','mgr1','recep2','mgrall','staff','ownerc','ownerb','norole']) loop
    perform pg_temp.act_as(pg_temp.id(u));
    set local role authenticated;
    execute format('select coalesce(md5(string_agg(id::text, '','' order by id)), ''none'') from public.clients where business_id in (%L, %L, %L)', pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc')) into o;
    execute format('select coalesce(md5(string_agg(id::text, '','' order by id)), ''none'') from public.clients_v where business_id in (%L, %L, %L)', pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc')) into n;
    reset role;
    total := total + 1;
    if o is distinct from n then bad := bad || 'clients_v/' || u || ' '; end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.chk('NEW policy ids == OLD policy ids for 12 tables x 10 callers + clients_v == clients for 8 callers (' || total || ' comparisons)', bad, '');
end $$;


do $$
begin
  perform pg_temp.chk('sanity: callers see DIFFERENT appointment sets (owner 4, mgr1 2, recep2 2, staff 1, other business 0)',
    pg_temp.vis('owner', 'select 1 from public.appointments') || '/' || pg_temp.vis('mgr1', 'select 1 from public.appointments') || '/' || pg_temp.vis('recep2', 'select 1 from public.appointments') || '/' || pg_temp.vis('staff', 'select 1 from public.appointments') || '/' || pg_temp.vis('ownerb', 'select 1 from public.appointments'), '5/2/3/1/0');
  perform pg_temp.chk('sanity: invoices owner 2, mgr1 1, recep2 1, business-wide manager 2, staff 0, other business 0',
    pg_temp.vis('owner', 'select 1 from public.invoices') || '/' || pg_temp.vis('mgr1', 'select 1 from public.invoices') || '/' || pg_temp.vis('recep2', 'select 1 from public.invoices') || '/' || pg_temp.vis('mgrall', 'select 1 from public.invoices') || '/' || pg_temp.vis('staff', 'select 1 from public.invoices') || '/' || pg_temp.vis('ownerb', 'select 1 from public.invoices'), '2/1/1/2/0/0');
  perform pg_temp.chk('sanity: the owner of an INACTIVE business sees none of its messages or invoices (can() needs an active business)',
    pg_temp.vis('ownerc', 'select 1 from public.messages where business_id = ''' || pg_temp.id('bizc') || '''') || pg_temp.vis('ownerc', 'select 1 from public.invoices'), '00');
  perform pg_temp.chk('sanity: messages owner 3 (two branches + the branchless one), mgr1 2, recep2 0',
    pg_temp.vis('owner', 'select 1 from public.messages where business_id = ''' || pg_temp.id('biza') || '''') || '/' || pg_temp.vis('mgr1', 'select 1 from public.messages where business_id = ''' || pg_temp.id('biza') || '''') || '/' || pg_temp.vis('recep2', 'select 1 from public.messages'), '3/2/0');
  perform pg_temp.chk('the set functions return only the caller''s own branches; anon cannot execute them',
    (pg_temp.as_q('mgr1', $q$select count(*)::text from public.perm_branch_ids('invoices.view', true)$q$)) || (pg_temp.as_q('ownerb', $q$select count(*)::text from public.perm_branch_ids('invoices.view', true)$q$)) || has_function_privilege('anon', 'public.perm_branch_ids(text,boolean)', 'execute')::text || has_function_privilege('anon', 'public.member_business_ids()', 'execute')::text, '11falsefalse');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
