-- Solo / Team owners edit their single location (docs/business-flows.md gap 7): permission,
-- stored values, unsafe changes refused with nothing written, no second location without
-- multi_branch, and invoices using the edited tax rate (issued ones keep theirs).
--
--   supabase db query --linked -f supabase/tests/40_single_branch_edit.sql
--
-- Plain SQL, own fixtures, rolled back. No migration: update_branch was never plan-gated.
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
  for r in select * from (values ('owner'),('mgr'),('recep'),('ownert'),('ownerb')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'loc.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
do $$
declare v_biz uuid;
begin
  perform pg_temp.act_as(pg_temp.id('owner')); set local role authenticated;
  v_biz := public.create_business_with_owner('Loc Solo','loc-solo','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizs', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownert')); set local role authenticated;
  v_biz := public.create_business_with_owner('Loc Team','loc-team','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizt', v_biz);
  perform pg_temp.act_as(pg_temp.id('ownerb')); set local role authenticated;
  v_biz := public.create_business_with_owner('Loc Other','loc-other','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizo', v_biz);
end $$;
insert into ids select 'brs', id from public.branches where business_id = pg_temp.id('bizs');
insert into ids select 'brt', id from public.branches where business_id = pg_temp.id('bizt');
select pg_temp.act_as(pg_temp.id('owner'));
select pg_temp.add_member('bizs', 'mgr', 'manager');
select pg_temp.add_member('bizs', 'recep', 'receptionist');
-- plans: Solo (active, paid) and Team (active, paid): not the trial, which is Business-level
update public.business_subscriptions set plan = 'solo', status = 'active' where business_id = pg_temp.id('bizs');
update public.business_subscriptions set plan = 'team', status = 'active' where business_id = pg_temp.id('bizt');

create or replace function pg_temp.br(p_branch text) returns text language sql as $$
  select concat_ws('|', name, coalesce(address,'-'), coalesce(phone,'-'), tax_rate_bp, timezone, currency, invoice_prefix) from public.branches where id = pg_temp.id(p_branch) $$;
create or replace function pg_temp.upd_branch(p_user text, p_branch text, p_patch text) returns jsonb language sql as $$
  select pg_temp.as_(p_user, format($q$select public.update_branch(%L, %L::jsonb)$q$, pg_temp.id(p_branch), p_patch)) $$;
create or replace function pg_temp.branch_count(p_biz text) returns text language sql as $$
  select count(*)::text from public.branches where business_id = pg_temp.id(p_biz) and deleted_at is null $$;

-- ============ 1. a Solo owner edits their single location ============
select pg_temp.chk('plans are as intended: Solo max_branches 1, Team max_branches 1',
  (public.business_plan_limits(pg_temp.id('bizs')) ->> 'max_branches') || '/' || (public.business_plan_limits(pg_temp.id('bizt')) ->> 'max_branches'), '1/1');
select pg_temp.chk('Solo: name, address, phone, tax rate, time zone, currency, prefix in one edit: ok',
  pg_temp.upd_branch('owner', 'brs', '{"name":"Salon Dubai","address":"12 Marina Walk","phone":"+971 4 000 0000","tax_rate_bp":500,"timezone":"Asia/Dubai","currency":"AED","invoice_prefix":"dxb"}') ->> 'ok', 'true');
select pg_temp.chk('...every stored value is the edited one (prefix upper-cased)', pg_temp.br('brs'), 'Salon Dubai|12 Marina Walk|+971 4 000 0000|500|Asia/Dubai|AED|DXB');
select pg_temp.chk('Team: the same edit works', pg_temp.upd_branch('ownert', 'brt', '{"address":"3 Main St","tax_rate_bp":2000}') ->> 'ok', 'true');
select pg_temp.chk('...stored', pg_temp.br('brt'), 'Main|3 Main St|-|2000|Europe/London|GBP|' || (select invoice_prefix from public.branches where id = pg_temp.id('brt')));

-- ============ 2. who may NOT ============
select pg_temp.chk('manager (no settings.business): forbidden', pg_temp.upd_branch('mgr', 'brs', '{"phone":"+1"}') ->> 'code', 'forbidden');
select pg_temp.chk('receptionist: forbidden', pg_temp.upd_branch('recep', 'brs', '{"phone":"+1"}') ->> 'code', 'forbidden');
select pg_temp.chk('another business''s owner: forbidden', pg_temp.upd_branch('ownerb', 'brs', '{"phone":"+1"}') ->> 'code', 'forbidden');
select pg_temp.chk('anon: refused (42501)', pg_temp.as_anon(format($q$select public.update_branch(%L, '{"phone":"+1"}'::jsonb)$q$, pg_temp.id('brs'))) ->> 'state', '42501');
select pg_temp.chk('...none of those changed the branch', pg_temp.br('brs'), 'Salon Dubai|12 Marina Walk|+971 4 000 0000|500|Asia/Dubai|AED|DXB');

-- ============ 3. no second location without multi_branch ============
select pg_temp.chk('Solo: create_branch refused (feature_unavailable)', pg_temp.as_('owner', format($q$select public.create_branch(%L, 'Second', 'GB', 'GBP', 'Europe/London')$q$, pg_temp.id('bizs'))) ->> 'code', 'feature_unavailable');
select pg_temp.chk('Team: create_branch refused too', pg_temp.as_('ownert', format($q$select public.create_branch(%L, 'Second', 'GB', 'GBP', 'Europe/London')$q$, pg_temp.id('bizt'))) ->> 'code', 'feature_unavailable');
select pg_temp.chk('a direct insert is stopped by the branch limit trigger (P0001) on both',
  pg_temp.try(format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix) values (%L, 'Sneaky', 'UTC', 'GBP', 'GB', 'SNK')$q$, pg_temp.id('bizs'))) || '/' ||
  pg_temp.try(format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix) values (%L, 'Sneaky', 'UTC', 'GBP', 'GB', 'SNK')$q$, pg_temp.id('bizt'))), 'P0001/P0001');
select pg_temp.chk('...both still have exactly one location', pg_temp.branch_count('bizs') || '/' || pg_temp.branch_count('bizt'), '1/1');
select pg_temp.chk('editing the only location does not need (or touch) multi_branch: archive is still blocked',
  pg_temp.as_('owner', format($q$select public.archive_branch(%L)$q$, pg_temp.id('brs'))) ->> 'code', 'feature_unavailable');

-- ============ 4. unsafe changes are refused and nothing is written ============
do $$
declare v_svc uuid; v_cl uuid; v_fv uuid; v_stf uuid; v_a uuid; v_i uuid; r jsonb; v_before text; v_prefix text; v_tax_before bigint;
begin
  select id into v_fv from public.form_versions where business_id = pg_temp.id('bizs') order by version desc limit 1;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('bizs'), 'Cut', 30, 0) returning id into v_svc;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, pg_temp.id('brs'), pg_temp.id('bizs'), 10000, true);
  insert into public.clients (business_id, full_name, phone_e164) values (pg_temp.id('bizs'), 'Loc Client', '+971500000001') returning id into v_cl;
  insert into public.staff_profiles (business_id, display_name, is_active) values (pg_temp.id('bizs'), 'Loc Staff', true) returning id into v_stf;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_stf, pg_temp.id('brs'), pg_temp.id('bizs'));

  v_before := pg_temp.br('brs');
  r := pg_temp.upd_branch('owner', 'brs', '{"currency":"USD"}');
  perform pg_temp.chk('currency change while the location has prices: currency_in_use', r ->> 'code', 'currency_in_use');
  perform pg_temp.chk('...stored currency unchanged', pg_temp.br('brs'), v_before);

  -- an upcoming booking blocks a time zone change
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('bizs'), pg_temp.id('brs'), v_cl, v_svc, v_stf, now() + interval '3 days', now() + interval '3 days 30 minutes', 30, 0, 'confirmed', 'dashboard', v_fv, 10000) returning id into v_a;
  r := pg_temp.upd_branch('owner', 'brs', '{"timezone":"Asia/Karachi"}');
  perform pg_temp.chk('time zone change with an upcoming booking: timezone_in_use', r ->> 'code', 'timezone_in_use');
  perform pg_temp.chk('...stored time zone unchanged', pg_temp.br('brs'), v_before);
  r := pg_temp.upd_branch('owner', 'brs', '{"address":"New address","timezone":"Asia/Karachi"}');
  perform pg_temp.chk('a refused field makes the WHOLE edit fail: the address was not written either', (r ->> 'ok') || '/' || pg_temp.br('brs'), 'false/' || v_before);
  perform pg_temp.chk('...but a safe edit alongside the booking is fine (tax rate)', pg_temp.upd_branch('owner', 'brs', '{"tax_rate_bp":700}') ->> 'ok', 'true');

  -- ============ 5. invoices use the edited tax rate; issued ones keep theirs ============
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('bizs'), pg_temp.id('brs'), v_cl, v_svc, v_stf, now() - interval '3 days', now() - interval '3 days' + interval '30 minutes', 30, 0, 'completed', 'dashboard', v_fv, 10000) returning id into v_a;
  r := pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L, %L, null, '[{"description":"Cut","quantity":1,"unit_price_minor":10000}]'::jsonb)$q$, pg_temp.id('brs'), v_a));
  v_i := (r ->> 'invoice_id')::uuid;
  perform pg_temp.chk('draft invoice takes the EDITED rate (7%): 700 on 10000', (select tax_rate_bp::text || '/' || tax_minor::text from public.invoices where id = v_i), '700/700');
  perform pg_temp.as_('owner', format($q$select public.issue_invoice(%L)$q$, v_i));
  perform pg_temp.chk('issued with 7%, total 10700, currency AED', (select status::text || '/' || tax_rate_bp::text || '/' || total_minor::text || '/' || currency from public.invoices where id = v_i), 'issued/700/10700/AED');
  insert into ids values ('inv1', v_i);

  -- after the first invoice: prefix and currency are locked, the tax rate is still editable for NEW invoices
  v_before := pg_temp.br('brs');
  perform pg_temp.chk('prefix change after the first invoice: prefix_locked', pg_temp.upd_branch('owner', 'brs', '{"invoice_prefix":"NEW"}') ->> 'code', 'prefix_locked');
  perform pg_temp.chk('currency change after the first invoice: currency_locked', pg_temp.upd_branch('owner', 'brs', '{"currency":"USD"}') ->> 'code', 'currency_locked');
  perform pg_temp.chk('...nothing changed', pg_temp.br('brs'), v_before);
  perform pg_temp.chk('changing the tax rate afterwards is allowed', pg_temp.upd_branch('owner', 'brs', '{"tax_rate_bp":1000}') ->> 'ok', 'true');
  perform pg_temp.chk('the ISSUED invoice keeps its 7% snapshot (immutable)', (select tax_rate_bp::text || '/' || total_minor::text from public.invoices where id = v_i), '700/10700');
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (pg_temp.id('bizs'), pg_temp.id('brs'), v_cl, v_svc, v_stf, now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', 30, 0, 'completed', 'dashboard', v_fv, 10000) returning id into v_a;
  r := pg_temp.as_('owner', format($q$select public.create_invoice_draft(%L, %L, null, '[{"description":"Cut","quantity":1,"unit_price_minor":10000}]'::jsonb)$q$, pg_temp.id('brs'), v_a));
  perform pg_temp.chk('a NEW invoice uses the new 10% rate', (select tax_rate_bp::text || '/' || tax_minor::text from public.invoices where id = (r ->> 'invoice_id')::uuid), '1000/1000');
  perform pg_temp.chk('the invoice number follows the edited prefix (DXB-...)', ((select number from public.invoices where id = v_i) like 'DXB-%')::text, 'true');
end $$;

select jsonb_build_object('passed', count(*) filter (where pass), 'failed', count(*) filter (where not pass), 'total', count(*),
  'failures', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'detail', detail) order by n) filter (where not pass), '[]'::jsonb)) as result from res;
rollback;
