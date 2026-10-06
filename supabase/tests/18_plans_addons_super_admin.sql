-- Phase 8A: plans, add-ons, feature gating, plan limits, super admin RPCs.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/18_plans_addons_super_admin.sql
--
-- Plain SQL, own fixtures (real auth.users, 3 businesses), everything rolled back.
-- Run on a database without leftover test data.
--
-- Covered: seeds; subscription mirror; EVERY super admin RPC refused for owner,
-- manager, staff, other business, super admin WITHOUT aal2, and anon (with the
-- subscription/audit/prices proven unchanged); feature matrix per plan; add-on
-- off/on; trial = business-level + add-ons on; trial expiry / extend / assign
-- lifecycle; staff cap at 1 / 5 / unlimited, inactive staff, reactivation;
-- downgrade refusal (nothing changes); multi-branch limit incl. soft delete;
-- custom roles gate; widget gate; add-on module example; audit rows (stored
-- values); detail / list (keyset, search, wildcard escaping) / support view;
-- SMS credits; prices; presets (invalid input leaves the original); review
-- takedown; direct-write refusals; grants; business-delete cascade.

begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create temporary table module_rows (business_id uuid) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got anycompatible, p_want anycompatible)
returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got::text is not distinct from p_want::text,
          'got ' || coalesce(p_got::text,'<null>') || ' want ' || coalesce(p_want::text,'<null>'));
end; $$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.ids to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.res to authenticated, anon', v_schema);
  execute format('grant select, insert on %I.module_rows to authenticated, anon', v_schema);
  execute format('grant usage, select on all sequences in schema %I to authenticated, anon', v_schema);
end $$;

-- Call a jsonb-returning SQL expression as a user (authenticated), optionally
-- with an aal2 session, or as anon (p_user null).
create or replace function pg_temp.call_as(p_user uuid, p_mfa boolean, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  if p_user is null then
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated', 'aal', case when p_mfa then 'aal2' else 'aal1' end)::text, true);
    set local role authenticated;
  end if;
  execute p_sql into r;
  reset role;
  return r;
exception when others then
  reset role;
  return jsonb_build_object('error', sqlstate);
end $$;
-- super admin with a TOTP session
create or replace function pg_temp.adm(p_sql text) returns jsonb language sql as $$
  select pg_temp.call_as(pg_temp.id('sadmin'), true, p_sql)
$$;
-- run a statement as a role; ok:<n> / ERR:<sqlstate>
create or replace function pg_temp.try_as(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v_n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute 'with q as (' || p_sql || ') select count(*) from q' into v_n;
    reset role; return 'ok:' || v_n;
  exception when others then
    reset role; return 'ERR:' || sqlstate;
  end;
end $$;
-- run a statement as postgres; 'ok' or the error MESSAGE (our codes are messages)
create or replace function pg_temp.msg(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;
create or replace function pg_temp.sub(p_biz text) returns text language sql as $$
  select concat_ws('|', s.plan, s.status, s.trial_ends_at, s.current_period_start, s.current_period_end, s.assigned_by, s.notes)
  from public.business_subscriptions s where s.business_id = pg_temp.id(p_biz)
$$;
create or replace function pg_temp.audits(p_action text) returns int language sql as $$
  select count(*)::int from public.audit_logs where action = p_action
$$;
create or replace function pg_temp.feat(p_biz text, p_key text) returns text language sql as $$
  select public.business_has_feature(pg_temp.id(p_biz), p_key)::text
$$;
create or replace function pg_temp.new_staff(p_biz text, p_branch text, p_name text, p_active boolean default true) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.staff_profiles (business_id, display_name, is_active)
  values (pg_temp.id(p_biz), p_name, p_active) returning id into v;
  insert into public.staff_branches (staff_id, branch_id, business_id)
  values (v, pg_temp.id(p_branch), pg_temp.id(p_biz));
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'),('manager'),('staffu'),('ownerb'),('ownerc'),('sadmin')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'p8.' || r.k || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
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
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P8 Alpha', 'p8-alpha', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
  reset role;
  insert into ids values ('biza', v_biz);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('ownerb'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P8 Beta', 'p8-beta', 'US', 'USD', 'America/New_York', 'en', null, 'Main');
  reset role;
  insert into ids values ('bizb', v_biz);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('ownerc'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P8 Gamma', 'p8-gamma', 'PK', 'PKR', 'Asia/Karachi', 'en', null, 'Main');
  reset role;
  insert into ids values ('bizc', v_biz);
end $$;
insert into ids select 'brancha', id from public.branches where business_id = pg_temp.id('biza') and is_primary limit 1;
insert into ids select 'branchb', id from public.branches where business_id = pg_temp.id('bizb') and is_primary limit 1;
insert into ids select 'branchc', id from public.branches where business_id = pg_temp.id('bizc') and is_primary limit 1;

-- manager + staff members of business A
do $$
declare r record; v_member uuid;
begin
  for r in select * from (values ('manager','manager'),('staffu','staff')) as x(k, role_key) loop
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id('biza'), pg_temp.id(r.k), 'active', now()) returning id into v_member;
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_member, (select id from public.roles where business_id is null and key = r.role_key), pg_temp.id('brancha'));
  end loop;
end $$;

-- ===========================================================================
-- 1. Seeds and the subscription mirror
-- ===========================================================================
select pg_temp.chk('3 plans', (select count(*)::int from public.plans), 3);
select pg_temp.chk('staff caps 1 / 5 / unlimited',
  (select string_agg(coalesce(staff_cap::text, 'null'), ',' order by sort_order) from public.plans), '1,5,null');
select pg_temp.chk('max branches 1 / 1 / unlimited',
  (select string_agg(coalesce(max_branches::text, 'null'), ',' order by sort_order) from public.plans), '1,1,null');
select pg_temp.chk('6 add-ons with the doc keys',
  (select string_agg(key, ',' order by key) from public.addons), 'client_portal,custom_roles,files_photos,forms_consent,inventory,packages');
select pg_temp.chk('every price is a positive placeholder',
  (select bool_and(price_monthly_minor > 0) from public.plans) and (select bool_and(price_monthly_minor > 0) from public.addons), true);
select pg_temp.chk('waitlist is not a feature of any plan',
  (select count(*)::int from public.plans where features ? 'waitlist'), 0);
select pg_temp.chk('a new business got a trialing subscription with no plan',
  (select status::text || ':' || coalesce(plan::text, 'null') from public.business_subscriptions where business_id = pg_temp.id('biza')), 'trialing:null');
select pg_temp.chk('...and its trial date equals the business column',
  (select s.trial_ends_at = b.trial_ends_at from public.business_subscriptions s join public.businesses b on b.id = s.business_id
   where s.business_id = pg_temp.id('biza')), true);
select pg_temp.chk('every existing business has a subscription',
  (select count(*)::int from public.businesses b where not exists (select 1 from public.business_subscriptions s where s.business_id = b.id)), 0);
select pg_temp.chk('an active subscription without a plan is refused',
  pg_temp.msg(format($q$update public.business_subscriptions set status = 'active', plan = null where business_id = %L$q$, pg_temp.id('biza'))) like '%active_needs_plan%', 'true');

-- ===========================================================================
-- 2. EVERY super admin RPC is refused for everyone but a TOTP-verified super admin
-- ===========================================================================
create temporary table calls (n int generated always as identity, name text, sql text) on commit drop;
insert into calls (name, sql)
select x.name, replace(x.sql, '@A', pg_temp.id('biza')::text) from (values
  ('list_businesses', $$select public.list_businesses()$$),
  ('get_business_detail', $$select public.get_business_detail('@A')$$),
  ('assign_plan', $$select public.assign_plan('@A', 'team')$$),
  ('set_business_status', $$select public.set_business_status('@A', 'suspended')$$),
  ('set_addon', $$select public.set_addon('@A', 'inventory', true)$$),
  ('extend_trial', $$select public.extend_trial('@A', 30)$$),
  ('admin_add_sms_credits', $$select public.admin_add_sms_credits('@A', 777)$$),
  ('admin_set_sms_rate', $$select public.admin_set_sms_rate('92', 'PK', 50)$$),
  ('set_plan_prices', $$select public.set_plan_prices('solo', 1, 1, 'USD')$$),
  ('set_addon_prices', $$select public.set_addon_prices('inventory', 1, 'USD')$$),
  ('upsert_industry_preset', $$select public.upsert_industry_preset('salon', 'Salon', '{}', '[]', 'default')$$),
  ('remove_review', $$select public.remove_review(gen_random_uuid(), 'because')$$),
  ('support_view_business', $$select public.support_view_business('@A')$$)) x(name, sql);
grant select on calls to authenticated, anon;

create temporary table before_state (k text primary key, v text) on commit drop;
insert into before_state values
  ('sub', pg_temp.sub('biza')),
  ('audit', (select count(*)::text from public.audit_logs)),
  ('plans', (select md5(string_agg(p::text, '|' order by p.key)) from public.plans p)),
  ('addons', (select md5(string_agg(a::text, '|' order by a.key)) from public.addons a)),
  ('presets', (select count(*)::text from public.industry_presets)),
  ('rates92', (select count(*)::text from public.sms_country_rates where dial_code = '92')),
  ('ledger', (select count(*)::text from public.sms_credit_ledger)),
  ('biz', (select concat_ws('|', plan, status, trial_ends_at) from public.businesses where id = pg_temp.id('biza')));

do $$
declare c record; r jsonb; v_who text; v_user uuid; v_mfa boolean;
begin
  for c in select * from calls order by n loop
    for v_who, v_user, v_mfa in
      select * from (values ('owner', pg_temp.id('owner'), true), ('manager', pg_temp.id('manager'), true),
        ('staff', pg_temp.id('staffu'), true), ('other business owner', pg_temp.id('ownerb'), true)) t(w, u, m)
    loop
      r := pg_temp.call_as(v_user, v_mfa, c.sql);
      perform pg_temp.chk(c.name || ' refused for ' || v_who, r ->> 'code', 'forbidden');
    end loop;
    r := pg_temp.call_as(pg_temp.id('sadmin'), false, c.sql);
    perform pg_temp.chk(c.name || ' refused for a super admin WITHOUT aal2', r ->> 'code', 'mfa_required');
    r := pg_temp.call_as(null, false, c.sql);
    perform pg_temp.chk(c.name || ' refused for anon (no EXECUTE)', r ->> 'error', '42501');
  end loop;
end $$;

select pg_temp.chk('refused calls changed no subscription', pg_temp.sub('biza'), (select v from before_state where k = 'sub'));
select pg_temp.chk('refused calls wrote no audit row', (select count(*)::text from public.audit_logs), (select v from before_state where k = 'audit'));
select pg_temp.chk('refused calls changed no plan price', (select md5(string_agg(p::text, '|' order by p.key)) from public.plans p), (select v from before_state where k = 'plans'));
select pg_temp.chk('refused calls changed no add-on price', (select md5(string_agg(a::text, '|' order by a.key)) from public.addons a), (select v from before_state where k = 'addons'));
select pg_temp.chk('refused calls created no preset', (select count(*)::text from public.industry_presets), (select v from before_state where k = 'presets'));
select pg_temp.chk('refused calls set no SMS rate', (select count(*)::text from public.sms_country_rates where dial_code = '92'), (select v from before_state where k = 'rates92'));
select pg_temp.chk('refused calls moved no credits', (select count(*)::text from public.sms_credit_ledger), (select v from before_state where k = 'ledger'));
select pg_temp.chk('refused calls left businesses untouched',
  (select concat_ws('|', plan, status, trial_ends_at) from public.businesses where id = pg_temp.id('biza')), (select v from before_state where k = 'biz'));

-- ===========================================================================
-- 3. Trial: Business-level, every add-on on, no caps
-- ===========================================================================
select pg_temp.chk('trial: limits are the Business plan (no caps)',
  (public.business_plan_limits(pg_temp.id('biza')) ->> 'plan') || ':' || coalesce(public.business_plan_limits(pg_temp.id('biza')) ->> 'staff_cap', 'null') || ':' || coalesce(public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches', 'null'),
  'business:null:null');
select pg_temp.chk('trial: every plan feature on',
  pg_temp.feat('biza', 'commission') || pg_temp.feat('biza', 'embed_widget') || pg_temp.feat('biza', 'advanced_reports') || pg_temp.feat('biza', 'custom_roles') || pg_temp.feat('biza', 'multi_branch') || pg_temp.feat('biza', 'website') || pg_temp.feat('biza', 'reviews') || pg_temp.feat('biza', 'booking_link') || pg_temp.feat('biza', 'core'),
  'truetruetruetruetruetruetruetruetrue');
select pg_temp.chk('trial: every add-on on without a business_addons row',
  pg_temp.feat('biza', 'packages') || pg_temp.feat('biza', 'inventory') || pg_temp.feat('biza', 'files_photos') || pg_temp.feat('biza', 'forms_consent') || pg_temp.feat('biza', 'client_portal'),
  'truetruetruetruetrue');
select pg_temp.chk('an unknown key is false', pg_temp.feat('biza', 'waitlist') || pg_temp.feat('biza', 'nonsense'), 'falsefalse');
select pg_temp.chk('a null business / key is false', coalesce(public.business_has_feature(null, 'core'), false)::text || coalesce(public.business_has_feature(pg_temp.id('biza'), null), false)::text, 'falsefalse');
select pg_temp.chk('a business that does not exist has no feature', public.business_has_feature(gen_random_uuid(), 'core')::text, 'false');
select pg_temp.chk('trial: widget on', public.widget_feature_enabled(pg_temp.id('biza'))::text, 'true');
select pg_temp.chk('trial: my_features (owner) says active, trial, all features',
  (pg_temp.call_as(pg_temp.id('owner'), false, format('select public.my_features(%L)', pg_temp.id('biza'))) -> 'features' ->> 'inventory') || (pg_temp.call_as(pg_temp.id('owner'), false, format('select public.my_features(%L)', pg_temp.id('biza'))) ->> 'trial'),
  'truetrue');
select pg_temp.chk('my_features: another business sees nothing',
  coalesce(pg_temp.call_as(pg_temp.id('ownerb'), false, format('select public.my_features(%L)', pg_temp.id('biza')))::text, 'null'), 'null');
select pg_temp.chk('my_features: anon refused', pg_temp.call_as(null, false, format('select public.my_features(%L)', pg_temp.id('biza'))) ->> 'error', '42501');
select pg_temp.chk('business_has_feature is not callable by the API roles',
  has_function_privilege('authenticated', 'public.business_has_feature(uuid,text)', 'execute')::text
  || has_function_privilege('anon', 'public.business_has_feature(uuid,text)', 'execute')::text
  || has_function_privilege('authenticated', 'public.business_plan_limits(uuid)', 'execute')::text, 'falsefalsefalse');

-- ===========================================================================
-- 4. Trial lifecycle: expiry locks, extend revives, assign activates
-- ===========================================================================
update public.business_subscriptions set trial_ends_at = now() - interval '1 day' where business_id = pg_temp.id('biza');
select pg_temp.chk('expired trial mirrored to businesses', (select trial_ends_at < now() from public.businesses where id = pg_temp.id('biza')), true);
select pg_temp.chk('expired trial: business inactive', public.business_is_active(pg_temp.id('biza'))::text, 'false');
select pg_temp.chk('expired trial: every feature is off',
  pg_temp.feat('biza', 'core') || pg_temp.feat('biza', 'website') || pg_temp.feat('biza', 'inventory') || pg_temp.feat('biza', 'embed_widget'), 'falsefalsefalsefalse');
select pg_temp.chk('expired trial: widget off', public.widget_feature_enabled(pg_temp.id('biza'))::text, 'false');
select pg_temp.chk('expired trial: my_features says inactive',
  pg_temp.call_as(pg_temp.id('owner'), false, format('select public.my_features(%L)', pg_temp.id('biza'))) ->> 'active', 'false');
select pg_temp.chk('expired trial: status is still trialing (no cron, no data change)', (select status::text from public.business_subscriptions where business_id = pg_temp.id('biza')), 'trialing');
select pg_temp.chk('the owner cannot extend their own trial',
  pg_temp.call_as(pg_temp.id('owner'), true, format('select public.extend_trial(%L, 30)', pg_temp.id('biza'))) ->> 'code', 'forbidden');
select pg_temp.chk('the owner cannot edit businesses.trial_ends_at directly',
  pg_temp.try_as(pg_temp.id('owner'), format($q$update public.businesses set trial_ends_at = now() + interval '90 days' where id = %L returning 1$q$, pg_temp.id('biza'))), 'ERR:42501');
select pg_temp.call_as(pg_temp.id('sadmin'), true, format($q$with u as (update public.businesses set plan = 'solo' where id = %L returning 1) select to_jsonb(count(*)) from u$q$, pg_temp.id('biza')));
select pg_temp.chk('...nor the super admin directly through the API (RLS or the guard stops it; the plan is unchanged)',
  (select plan is null from public.businesses where id = pg_temp.id('biza')), true);

select pg_temp.chk('extend_trial: days 0 refused', pg_temp.adm(format('select public.extend_trial(%L, 0)', pg_temp.id('biza'))) ->> 'code', 'invalid_days');
select pg_temp.chk('extend_trial: days 91 refused', pg_temp.adm(format('select public.extend_trial(%L, 91)', pg_temp.id('biza'))) ->> 'code', 'invalid_days');
select pg_temp.chk('extend_trial: unknown business', pg_temp.adm(format('select public.extend_trial(%L, 5)', gen_random_uuid())) ->> 'code', 'not_found');
select pg_temp.chk('...bad calls changed nothing', pg_temp.sub('biza') like 'trialing%' and (select trial_ends_at < now() from public.business_subscriptions where business_id = pg_temp.id('biza')), 'true');
select pg_temp.chk('extend_trial 7 days on an expired trial', pg_temp.adm(format('select public.extend_trial(%L, 7)', pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('...new end is ~7 days from NOW (not from the old date)',
  (select trial_ends_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.business_subscriptions where business_id = pg_temp.id('biza')), true);
select pg_temp.chk('...mirrored to businesses and active again',
  (select (trial_ends_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour')::text || public.business_is_active(id)::text from public.businesses where id = pg_temp.id('biza')), 'truetrue');
select pg_temp.chk('...features back', pg_temp.feat('biza', 'inventory') || pg_temp.feat('biza', 'embed_widget'), 'truetrue');
select pg_temp.chk('extend_trial audit row stores before/after and days',
  (select (before ->> 'status') || ':' || (after ->> 'status') || ':' || (after ->> 'days') || ':' || (actor_user_id = pg_temp.id('sadmin'))::text
   from public.audit_logs where action = 'admin.extend_trial' and business_id = pg_temp.id('biza') order by id desc limit 1), 'trialing:trialing:7:true');

-- trial -> inactive -> activate without a plan is refused; assign activates
select pg_temp.chk('activating without a plan: plan_required',
  pg_temp.adm(format($q$select public.set_business_status(%L, 'active')$q$, pg_temp.id('biza'))) ->> 'code', 'plan_required');
select pg_temp.chk('...still trialing', (select status::text from public.business_subscriptions where business_id = pg_temp.id('biza')), 'trialing');
select pg_temp.chk('set_business_status rejects trialing', pg_temp.adm(format($q$select public.set_business_status(%L, 'trialing')$q$, pg_temp.id('biza'))) ->> 'code', 'invalid_status');
select pg_temp.chk('set_business_status inactive ok', pg_temp.adm(format($q$select public.set_business_status(%L, 'inactive')$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('inactive: locked, mirrored', (select status::text || public.business_is_active(id)::text from public.businesses where id = pg_temp.id('biza')), 'inactivefalse');
select pg_temp.chk('extend_trial revives an inactive business as trialing',
  pg_temp.adm(format('select public.extend_trial(%L, 3)', pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('...trialing and active', (select status::text || public.business_is_active(id)::text from public.businesses where id = pg_temp.id('biza')), 'trialingtrue');
select pg_temp.chk('assign_plan: invalid plan', pg_temp.adm(format($q$select public.assign_plan(%L, 'gold')$q$, pg_temp.id('biza'))) ->> 'code', 'invalid_plan');
select pg_temp.chk('assign_plan: past period end', pg_temp.adm(format($q$select public.assign_plan(%L, 'solo', now() - interval '1 day')$q$, pg_temp.id('biza'))) ->> 'code', 'invalid_period');
select pg_temp.chk('assign_plan: unknown business', pg_temp.adm(format($q$select public.assign_plan(%L, 'solo')$q$, gen_random_uuid())) ->> 'code', 'not_found');
select pg_temp.chk('...bad assigns changed nothing', (select status::text || coalesce(plan::text, '-') from public.business_subscriptions where business_id = pg_temp.id('biza')), 'trialing-');

-- ===========================================================================
-- 5. Feature matrix per plan (business A has no staff, one branch)
-- ===========================================================================
select pg_temp.chk('assign solo ok', pg_temp.adm(format($q$select public.assign_plan(%L, 'solo', now() + interval '30 days', 'first plan')$q$, pg_temp.id('biza'))) ->> 'status', 'active');
select pg_temp.chk('assign stored plan, status, period, assigned_by, notes',
  (select plan::text || ':' || status::text || ':' || (current_period_end > now())::text || ':' || (assigned_by = pg_temp.id('sadmin'))::text || ':' || notes from public.business_subscriptions where business_id = pg_temp.id('biza')),
  'solo:active:true:true:first plan');
select pg_temp.chk('...mirrored to businesses', (select plan::text || ':' || status::text from public.businesses where id = pg_temp.id('biza')), 'solo:active');
select pg_temp.chk('SOLO core/website/reviews/booking_link on',
  pg_temp.feat('biza', 'core') || pg_temp.feat('biza', 'website') || pg_temp.feat('biza', 'reviews') || pg_temp.feat('biza', 'booking_link'), 'truetruetruetrue');
select pg_temp.chk('SOLO commission/widget/advanced_reports/custom_roles/multi_branch off',
  pg_temp.feat('biza', 'commission') || pg_temp.feat('biza', 'embed_widget') || pg_temp.feat('biza', 'advanced_reports') || pg_temp.feat('biza', 'custom_roles') || pg_temp.feat('biza', 'multi_branch'),
  'falsefalsefalsefalsefalse');
select pg_temp.chk('SOLO widget gate off', public.widget_feature_enabled(pg_temp.id('biza'))::text, 'false');
select pg_temp.chk('SOLO add-ons off until enabled',
  pg_temp.feat('biza', 'packages') || pg_temp.feat('biza', 'inventory') || pg_temp.feat('biza', 'files_photos') || pg_temp.feat('biza', 'forms_consent') || pg_temp.feat('biza', 'client_portal'),
  'falsefalsefalsefalsefalse');
select pg_temp.chk('SOLO limits 1 staff / 1 branch',
  (public.business_plan_limits(pg_temp.id('biza')) ->> 'staff_cap') || ':' || (public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches'), '1:1');

-- add-on off/on
select pg_temp.chk('set_addon unknown key', pg_temp.adm(format($q$select public.set_addon(%L, 'waitlist', true)$q$, pg_temp.id('biza'))) ->> 'code', 'unknown_addon');
select pg_temp.chk('set_addon unknown business', pg_temp.adm(format($q$select public.set_addon(%L, 'inventory', true)$q$, gen_random_uuid())) ->> 'code', 'not_found');
select pg_temp.chk('set_addon null flag', pg_temp.adm(format($q$select public.set_addon(%L, 'inventory', null)$q$, pg_temp.id('biza'))) ->> 'code', 'invalid_input');
select pg_temp.chk('...refused calls stored nothing', (select count(*)::int from public.business_addons where business_id = pg_temp.id('biza')), 0);
select pg_temp.chk('set_addon inventory on', pg_temp.adm(format($q$select public.set_addon(%L, 'inventory', true)$q$, pg_temp.id('biza'))) ->> 'enabled', 'true');
select pg_temp.chk('...stored row: enabled by the super admin',
  (select enabled::text || ':' || (enabled_by = pg_temp.id('sadmin'))::text from public.business_addons where business_id = pg_temp.id('biza') and addon_key = 'inventory'), 'true:true');
select pg_temp.chk('...inventory on, packages still off', pg_temp.feat('biza', 'inventory') || pg_temp.feat('biza', 'packages'), 'truefalse');
select pg_temp.chk('set_addon audit stores before/after',
  (select (before ->> 'enabled') || ':' || (after ->> 'enabled') || ':' || entity_id from public.audit_logs where action = 'admin.set_addon' and business_id = pg_temp.id('biza') order by id desc limit 1), 'false:true:inventory');
select pg_temp.chk('set_addon inventory off again', pg_temp.adm(format($q$select public.set_addon(%L, 'inventory', false)$q$, pg_temp.id('biza'))) ->> 'enabled', 'false');
select pg_temp.chk('...off', pg_temp.feat('biza', 'inventory'), 'false');
select pg_temp.chk('packages enabled for A', pg_temp.adm(format($q$select public.set_addon(%L, 'packages', true)$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('...A has packages', pg_temp.feat('biza', 'packages'), 'true');

-- module example: an Phase 10 RPC refuses when the add-on is off, writes when on
create or replace function pg_temp.example_module_rpc(p_biz uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb := public.feature_gate_error(p_biz, 'inventory');
begin
  if v is not null then return v; end if;
  insert into pg_temp.module_rows values (p_biz);
  return jsonb_build_object('ok', true);
end $$;
select pg_temp.chk('module RPC refuses with the add-on off', public.feature_gate_error(pg_temp.id('biza'), 'inventory'), jsonb_build_object('ok', false, 'code', 'feature_unavailable', 'feature', 'inventory'));
select pg_temp.chk('module example: off -> feature_unavailable', pg_temp.example_module_rpc(pg_temp.id('biza')) ->> 'code', 'feature_unavailable');
select pg_temp.chk('...and nothing written', (select count(*)::int from module_rows), 0);
select pg_temp.adm(format($q$select public.set_addon(%L, 'inventory', true)$q$, pg_temp.id('biza')));
select pg_temp.chk('module example: on -> ok', pg_temp.example_module_rpc(pg_temp.id('biza')) ->> 'ok', 'true');
select pg_temp.chk('...and one row written', (select count(*)::int from module_rows), 1);
select pg_temp.chk('feature_gate_error is NULL when allowed', coalesce(public.feature_gate_error(pg_temp.id('biza'), 'inventory')::text, 'null'), 'null');

-- team
select pg_temp.chk('assign team', pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('biza'))) ->> 'plan', 'team');
select pg_temp.chk('TEAM commission/widget/advanced_reports on',
  pg_temp.feat('biza', 'commission') || pg_temp.feat('biza', 'embed_widget') || pg_temp.feat('biza', 'advanced_reports'), 'truetruetrue');
select pg_temp.chk('TEAM custom_roles OFF without the add-on, multi_branch off',
  pg_temp.feat('biza', 'custom_roles') || pg_temp.feat('biza', 'multi_branch'), 'falsefalse');
select pg_temp.chk('TEAM widget gate on', public.widget_feature_enabled(pg_temp.id('biza'))::text, 'true');
select pg_temp.chk('TEAM limits 5 staff / 1 branch',
  (public.business_plan_limits(pg_temp.id('biza')) ->> 'staff_cap') || ':' || (public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches'), '5:1');
select pg_temp.adm(format($q$select public.set_addon(%L, 'custom_roles', true)$q$, pg_temp.id('biza')));
select pg_temp.chk('custom_roles add-on on TEAM turns it on', pg_temp.feat('biza', 'custom_roles'), 'true');
select pg_temp.chk('...custom role can now be created',
  pg_temp.msg(format($q$insert into public.roles (business_id, key, name, is_system) values (%L, 'p8_custom', 'P8 Custom', false)$q$, pg_temp.id('biza'))), 'ok');
select pg_temp.adm(format($q$select public.set_addon(%L, 'custom_roles', false)$q$, pg_temp.id('biza')));
select pg_temp.chk('...add-on off again: a custom role is refused (feature_unavailable)',
  pg_temp.msg(format($q$insert into public.roles (business_id, key, name, is_system) values (%L, 'p8_custom2', 'P8 Custom 2', false)$q$, pg_temp.id('biza'))), 'feature_unavailable');
select pg_temp.chk('...and was not stored', (select count(*)::int from public.roles where business_id = pg_temp.id('biza') and key = 'p8_custom2'), 0);

-- business
select pg_temp.chk('assign business', pg_temp.adm(format($q$select public.assign_plan(%L, 'business')$q$, pg_temp.id('biza'))) ->> 'plan', 'business');
select pg_temp.chk('BUSINESS: everything in the plan on, custom_roles INCLUDED (no add-on needed)',
  pg_temp.feat('biza', 'commission') || pg_temp.feat('biza', 'embed_widget') || pg_temp.feat('biza', 'advanced_reports') || pg_temp.feat('biza', 'custom_roles') || pg_temp.feat('biza', 'multi_branch'),
  'truetruetruetruetrue');
select pg_temp.chk('BUSINESS: a custom role works with the add-on switched off',
  (select enabled::text from public.business_addons where business_id = pg_temp.id('biza') and addon_key = 'custom_roles') || ':' ||
  pg_temp.msg(format($q$insert into public.roles (business_id, key, name, is_system) values (%L, 'p8_custom3', 'P8 Custom 3', false)$q$, pg_temp.id('biza'))), 'false:ok');
select pg_temp.chk('BUSINESS: a non-included add-on still needs enabling (packages was enabled, forms_consent was not)',
  pg_temp.feat('biza', 'packages') || pg_temp.feat('biza', 'forms_consent'), 'truefalse');
select pg_temp.chk('BUSINESS limits unlimited',
  coalesce(public.business_plan_limits(pg_temp.id('biza')) ->> 'staff_cap', 'null') || ':' || coalesce(public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches', 'null'), 'null:null');
select pg_temp.chk('Custom role gate: trial business C may create one (Business-level)',
  pg_temp.msg(format($q$insert into public.roles (business_id, key, name, is_system) values (%L, 'c_custom', 'C Custom', false)$q$, pg_temp.id('bizc'))), 'ok');

-- suspended stays suspended on assign; all features off
select pg_temp.adm(format($q$select public.set_business_status(%L, 'suspended')$q$, pg_temp.id('biza')));
select pg_temp.chk('SUSPENDED: features off, active false', pg_temp.feat('biza', 'core') || public.business_is_active(pg_temp.id('biza'))::text, 'falsefalse');
select pg_temp.chk('assign_plan on a suspended business keeps it suspended',
  (pg_temp.adm(format($q$select public.assign_plan(%L, 'business')$q$, pg_temp.id('biza'))) ->> 'status'), 'suspended');
select pg_temp.chk('...stored suspended', (select status::text from public.business_subscriptions where business_id = pg_temp.id('biza')), 'suspended');
select pg_temp.chk('extend_trial refuses a suspended business', pg_temp.adm(format('select public.extend_trial(%L, 5)', pg_temp.id('biza'))) ->> 'code', 'not_extendable');
select pg_temp.chk('set_business_status active (plan exists)', pg_temp.adm(format($q$select public.set_business_status(%L, 'active', 'paid')$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('...back to active, features on', public.business_is_active(pg_temp.id('biza'))::text || pg_temp.feat('biza', 'core'), 'truetrue');
select pg_temp.chk('extend_trial refuses an active paid business', pg_temp.adm(format('select public.extend_trial(%L, 5)', pg_temp.id('biza'))) ->> 'code', 'not_extendable');
select pg_temp.chk('set_business_status invalid value', pg_temp.adm(format($q$select public.set_business_status(%L, 'deleted')$q$, pg_temp.id('biza'))) ->> 'code', 'invalid_status');

-- ===========================================================================
-- 6. Staff cap: 1 / 5 / unlimited, inactive staff, reactivation, refusal leaves data alone
-- ===========================================================================
-- SOLO (business C)
select pg_temp.chk('C: assign solo', pg_temp.adm(format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizc'))) ->> 'ok', 'true');
select pg_temp.chk('SOLO: first staff member is allowed', pg_temp.msg(format($q$select pg_temp.new_staff('bizc', 'branchc', 'Solo One')$q$)), 'ok');
select pg_temp.chk('SOLO: the second is refused (staff_cap_reached)', pg_temp.msg(format($q$select pg_temp.new_staff('bizc', 'branchc', 'Solo Two')$q$)), 'staff_cap_reached');
select pg_temp.chk('...and no assignment row was stored for it',
  (select count(*)::int from public.staff_branches where branch_id = pg_temp.id('branchc')), 1);
select pg_temp.chk('SOLO: an INACTIVE second profile can be assigned (does not count)',
  pg_temp.msg(format($q$select pg_temp.new_staff('bizc', 'branchc', 'Solo Inactive', false)$q$)), 'ok');
select pg_temp.chk('SOLO: reactivating it is refused and it stays inactive',
  pg_temp.msg(format($q$update public.staff_profiles set is_active = true where business_id = %L and display_name = 'Solo Inactive'$q$, pg_temp.id('bizc'))) || ':' ||
  (select is_active::text from public.staff_profiles where business_id = pg_temp.id('bizc') and display_name = 'Solo Inactive'), 'staff_cap_reached:false');
select pg_temp.chk('SOLO: deactivating the first frees the seat',
  pg_temp.msg(format($q$update public.staff_profiles set is_active = false where business_id = %L and display_name = 'Solo One'$q$, pg_temp.id('bizc'))), 'ok');
select pg_temp.chk('...so the other can now be reactivated',
  pg_temp.msg(format($q$update public.staff_profiles set is_active = true where business_id = %L and display_name = 'Solo Inactive'$q$, pg_temp.id('bizc'))), 'ok');
select pg_temp.chk('SOLO: a soft-deleted staff member does not count',
  pg_temp.msg(format($q$update public.staff_profiles set deleted_at = now(), is_active = false where business_id = %L and display_name = 'Solo Inactive'$q$, pg_temp.id('bizc'))) || ':' ||
  pg_temp.msg(format($q$select pg_temp.new_staff('bizc', 'branchc', 'Solo Three')$q$)), 'ok:ok');

select pg_temp.chk('an add-on enabled for A does not leak to solo business C', pg_temp.feat('biza', 'packages') || pg_temp.feat('bizc', 'packages'), 'truefalse');

-- TEAM (business A, set up from scratch: business -> downgrade path tested below)
select pg_temp.chk('A: team', pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
do $$
declare v_i int; v_msg text; v_ok int := 0;
begin
  for v_i in 1..5 loop
    v_msg := pg_temp.msg(format($q$select pg_temp.new_staff('biza', 'brancha', %L)$q$, 'Team ' || v_i));
    if v_msg = 'ok' then v_ok := v_ok + 1; end if;
  end loop;
  perform pg_temp.chk('TEAM: staff 1..5 all allowed', v_ok, 5);
  v_msg := pg_temp.msg($q$select pg_temp.new_staff('biza', 'brancha', 'Team 6')$q$);
  perform pg_temp.chk('TEAM: the 6th is refused', v_msg, 'staff_cap_reached');
end $$;
select pg_temp.chk('TEAM: exactly 5 active staff stored (6th row rolled back with the profile statement)',
  (select count(*)::int from public.staff_branches sb join public.staff_profiles sp on sp.id = sb.staff_id where sb.branch_id = pg_temp.id('brancha') and sp.is_active), 5);
insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('biza'), 'Team 6');
select pg_temp.chk('TEAM: the Owner through the API gets the same refusal (RLS allows the write, the plan refuses)',
  (select pg_temp.try_as(pg_temp.id('owner'), format($q$insert into public.staff_branches (staff_id, branch_id, business_id)
     select sp.id, %L, %L from public.staff_profiles sp where sp.business_id = %L and sp.display_name = 'Team 6' returning 1$q$, pg_temp.id('brancha'), pg_temp.id('biza'), pg_temp.id('biza')))), 'ERR:P0001');
select pg_temp.chk('...the failed insert left Team 6 without a branch',
  (select count(*)::int from public.staff_branches sb join public.staff_profiles sp on sp.id = sb.staff_id where sp.display_name = 'Team 6' and sp.business_id = pg_temp.id('biza')), 0);

-- BUSINESS (business B): unlimited
select pg_temp.chk('B: business plan', pg_temp.adm(format($q$select public.assign_plan(%L, 'business')$q$, pg_temp.id('bizb'))) ->> 'ok', 'true');
do $$
declare v_i int; v_ok int := 0;
begin
  for v_i in 1..8 loop
    if pg_temp.msg(format($q$select pg_temp.new_staff('bizb', 'branchb', %L)$q$, 'Biz ' || v_i)) = 'ok' then v_ok := v_ok + 1; end if;
  end loop;
  perform pg_temp.chk('BUSINESS: 8 staff at one location, none refused', v_ok, 8);
end $$;

-- ===========================================================================
-- 7. Downgrade with more staff than the cap: REFUSED, nothing changes
-- ===========================================================================
select pg_temp.chk('B: downgrade 8 staff -> team refused over_limit',
  pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('bizb'))) ->> 'code', 'over_limit');
select pg_temp.chk('...the response names the location, the count and the cap',
  (select (e ->> 'active_staff') || ':' || (e ->> 'cap') || ':' || (e ->> 'branch')
   from jsonb_array_elements(pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('bizb'))) -> 'staff_over_cap') e limit 1), '8:5:Main');
select pg_temp.chk('...subscription and businesses unchanged (plan business, still active)',
  (select s.plan::text || ':' || s.status::text || ':' || b.plan::text || ':' || b.status::text from public.business_subscriptions s join public.businesses b on b.id = s.business_id where s.business_id = pg_temp.id('bizb')),
  'business:active:business:active');
select pg_temp.chk('...no admin.assign_plan audit row for the refused calls',
  (select count(*)::int from public.audit_logs where action = 'admin.assign_plan' and business_id = pg_temp.id('bizb') and (after ->> 'plan') = 'team'), 0);
select pg_temp.chk('...all 8 staff still active', (select count(*)::int from public.staff_profiles where business_id = pg_temp.id('bizb') and is_active), 8);
select pg_temp.chk('B: downgrade to solo is also refused', pg_temp.adm(format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizb'))) ->> 'code', 'over_limit');
update public.staff_profiles set is_active = false where business_id = pg_temp.id('bizb') and display_name in ('Biz 6', 'Biz 7', 'Biz 8');
select pg_temp.chk('B: after deactivating 3 (5 active) team is allowed', pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('bizb'))) ->> 'plan', 'team');
select pg_temp.chk('B: and the cap now holds (reactivating #6 is refused)',
  pg_temp.msg(format($q$update public.staff_profiles set is_active = true where business_id = %L and display_name = 'Biz 6'$q$, pg_temp.id('bizb'))), 'staff_cap_reached');
select pg_temp.chk('set_business_status active re-checks limits',
  (pg_temp.adm(format($q$select public.set_business_status(%L, 'inactive')$q$, pg_temp.id('bizb'))) ->> 'ok')
  || (select count(*)::text from public.staff_profiles where business_id = pg_temp.id('bizb') and is_active), 'true5');
alter table public.staff_profiles disable trigger staff_profiles_enforce_cap;
update public.staff_profiles set is_active = true where business_id = pg_temp.id('bizb') and display_name in ('Biz 6', 'Biz 7');  -- hand SQL while inactive
alter table public.staff_profiles enable trigger staff_profiles_enforce_cap;
select pg_temp.chk('...activating an inactive business that is now over its cap: over_limit',
  pg_temp.adm(format($q$select public.set_business_status(%L, 'active')$q$, pg_temp.id('bizb'))) ->> 'code', 'over_limit');
update public.staff_profiles set is_active = false where business_id = pg_temp.id('bizb') and display_name in ('Biz 6', 'Biz 7');
select pg_temp.chk('...fixed -> active again', pg_temp.adm(format($q$select public.set_business_status(%L, 'active')$q$, pg_temp.id('bizb'))) ->> 'ok', 'true');

-- ===========================================================================
-- 8. Multi-branch
-- ===========================================================================
select pg_temp.chk('TEAM (A): a second branch is refused (branch_limit_reached)',
  pg_temp.msg(format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix)
    values (%L, 'Second', 'Europe/London', 'GBP', 'GB', 'SEC')$q$, pg_temp.id('biza'))), 'branch_limit_reached');
select pg_temp.chk('...still one live branch', (select count(*)::int from public.branches where business_id = pg_temp.id('biza') and deleted_at is null), 1);
select pg_temp.chk('...the Owner through the API gets the same refusal',
  pg_temp.try_as(pg_temp.id('owner'), format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix)
    values (%L, 'Second', 'Europe/London', 'GBP', 'GB', 'SEC') returning 1$q$, pg_temp.id('biza'))), 'ERR:P0001');
-- trial C is Business-level; it was moved to solo above, so test trial on a fresh business below.
select pg_temp.chk('SOLO (C): a second branch is refused', pg_temp.msg(format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix)
    values (%L, 'C2', 'Asia/Karachi', 'PKR', 'PK', 'CTW')$q$, pg_temp.id('bizc'))), 'branch_limit_reached');

select pg_temp.chk('A -> business', pg_temp.adm(format($q$select public.assign_plan(%L, 'business')$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('BUSINESS (A): a second branch is allowed',
  pg_temp.msg(format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix)
    values (%L, 'Second', 'Europe/London', 'GBP', 'GB', 'SEC')$q$, pg_temp.id('biza'))), 'ok');
select pg_temp.chk('A: downgrade to team with 2 live branches: over_limit + branches_over',
  (pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('biza'))) ->> 'code') || ':' ||
  (pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('biza'))) -> 'branches_over' ->> 'current') || ':' ||
  (pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('biza'))) -> 'branches_over' ->> 'max'), 'over_limit:2:1');
select pg_temp.chk('...plan still business', (select plan::text from public.business_subscriptions where business_id = pg_temp.id('biza')), 'business');
update public.branches set deleted_at = now() where business_id = pg_temp.id('biza') and name = 'Second';
select pg_temp.chk('...soft-deleting the second branch allows the downgrade', pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('biza'))) ->> 'plan', 'team');
select pg_temp.chk('...and restoring that branch is now refused',
  pg_temp.msg(format($q$update public.branches set deleted_at = null where business_id = %L and name = 'Second'$q$, pg_temp.id('biza'))), 'branch_limit_reached');
select pg_temp.chk('...it stays deleted', (select (deleted_at is not null)::text from public.branches where business_id = pg_temp.id('biza') and name = 'Second'), 'true');
select pg_temp.chk('a SOFT-DELETED branch does not count toward the limit (insert a different one on solo C)',
  pg_temp.msg(format($q$update public.branches set deleted_at = now() where id = %L$q$, pg_temp.id('branchc'))) || ':' ||
  pg_temp.msg(format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix)
    values (%L, 'C-new', 'Asia/Karachi', 'PKR', 'PK', 'CNW')$q$, pg_temp.id('bizc'))), 'ok:ok');
-- fresh trial business: Business-level branches
do $$
declare v uuid;
begin
  insert into ids values ('trialuser', gen_random_uuid());
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (pg_temp.id('trialuser'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p8.trial@example.com',
    extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('trialuser'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.create_business_with_owner('P8 Trial', 'p8-trial', 'AE', 'AED', 'Asia/Dubai', 'en', null, 'Main');
  reset role;
  insert into ids values ('bizt', v);
end $$;
select pg_temp.chk('TRIAL: a second branch is allowed',
  pg_temp.msg(format($q$insert into public.branches (business_id, name, timezone, currency, country_code, invoice_prefix)
    values (%L, 'T2', 'Asia/Dubai', 'AED', 'AE', 'TWO')$q$, pg_temp.id('bizt'))), 'ok');
select pg_temp.chk('TRIAL -> solo with 2 branches refused', pg_temp.adm(format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizt'))) ->> 'code', 'over_limit');
select pg_temp.chk('...trial untouched', (select status::text || coalesce(plan::text, '-') from public.business_subscriptions where business_id = pg_temp.id('bizt')), 'trialing-');

-- ===========================================================================
-- 9. Audit rows: stored values
-- ===========================================================================
select pg_temp.chk('assign_plan audit: actor, before, after',
  (select (actor_user_id = pg_temp.id('sadmin'))::text || ':' || (after ->> 'plan') || ':' || (before ->> 'plan') || ':' || (after ->> 'status')
   from public.audit_logs where action = 'admin.assign_plan' and business_id = pg_temp.id('biza') order by id desc limit 1), 'true:team:business:active');
select pg_temp.chk('set_status audit stores the new status',
  (select (before ->> 'status') || '>' || (after ->> 'status') from public.audit_logs where action = 'admin.set_status' and business_id = pg_temp.id('biza') order by id desc limit 1), 'suspended>active');
select pg_temp.chk('admin notes are NOT copied into the audit log (the tenant can read audit_logs)',
  (select count(*)::int from public.audit_logs where business_id = pg_temp.id('biza') and (before::text like '%first plan%' or after::text like '%first plan%')), 0);
select pg_temp.chk('the owner sees admin audit rows of their own business (transparency)',
  (select pg_temp.try_as(pg_temp.id('owner'), format($q$select 1 from public.audit_logs where business_id = %L and action = 'admin.assign_plan'$q$, pg_temp.id('biza')))) <> 'ok:0', 'true');
select pg_temp.chk('...but not another business''s',
  (select pg_temp.try_as(pg_temp.id('ownerb'), format($q$select 1 from public.audit_logs where business_id = %L and action like 'admin.%%'$q$, pg_temp.id('biza')))), 'ok:0');

-- ===========================================================================
-- 10. get_business_detail, support view, list_businesses
-- ===========================================================================
select pg_temp.adm(format($q$select public.admin_add_sms_credits(%L, 1500, 'pack')$q$, pg_temp.id('biza')));
create temporary table detail (j jsonb) on commit drop;
grant select, insert on detail to authenticated;
do $$
declare v_before int := pg_temp.audits('admin.view_business');
begin
  insert into detail select pg_temp.adm(format('select public.get_business_detail(%L)', pg_temp.id('biza')));
  perform pg_temp.chk('detail: ok and the business', (select (j ->> 'ok') || ':' || (j -> 'business' ->> 'slug') from detail), 'true:p8-alpha');
  perform pg_temp.chk('detail: plan, status, active', (select (j -> 'subscription' ->> 'plan') || ':' || (j -> 'subscription' ->> 'status') || ':' || (j ->> 'is_active') from detail), 'team:active:true');
  perform pg_temp.chk('detail: usage counts are the stored counts',
    (select (j -> 'usage' ->> 'staff_active') || ':' || (j -> 'usage' ->> 'branches') || ':' || (j -> 'usage' ->> 'sms_balance') || ':' || (j -> 'usage' ->> 'invoices_issued') from detail), '6:1:1500:0');  -- 5 assigned + Team 6 (active, no location yet)
  perform pg_temp.chk('detail: six add-ons listed, packages enabled, forms_consent not',
    (select jsonb_array_length(j -> 'addons')::text || ':' || (select (a ->> 'enabled') from jsonb_array_elements(j -> 'addons') a where a ->> 'key' = 'packages') || ':' || (select (a ->> 'enabled') from jsonb_array_elements(j -> 'addons') a where a ->> 'key' = 'forms_consent') from detail), '6:true:false');
  perform pg_temp.chk('detail: limits', (select (j -> 'limits' ->> 'staff_cap') from detail), '5');
  perform pg_temp.chk('detail: internal notes visible to the super admin (the last note written)', (select (j -> 'subscription' ->> 'notes') from detail), 'paid');
  perform pg_temp.chk('detail: unknown business', pg_temp.adm(format('select public.get_business_detail(%L)', gen_random_uuid())) ->> 'code', 'not_found');
  perform pg_temp.chk('detail wrote exactly one audit row (admin.view_business)', pg_temp.audits('admin.view_business') - v_before, 1);
  perform pg_temp.chk('...naming the business and the actor',
    (select (business_id = pg_temp.id('biza'))::text || ':' || (actor_user_id = pg_temp.id('sadmin'))::text from public.audit_logs where action = 'admin.view_business' order by id desc limit 1), 'true:true');
end $$;
select pg_temp.chk('SMS credit add: stored in the ledger and the audit log',
  (select (amount::text || ':' || balance_after::text || ':' || (created_by = pg_temp.id('sadmin'))::text) from public.sms_credit_ledger where business_id = pg_temp.id('biza') order by id desc limit 1), '1500:1500:true');
select pg_temp.chk('...audit row', (select (after ->> 'credits') || ':' || (after ->> 'balance_after') from public.audit_logs where action = 'sms.credits_changed' and business_id = pg_temp.id('biza') order by id desc limit 1), '1500:1500');
select pg_temp.chk('SMS credits: zero refused, nothing stored', (pg_temp.adm(format('select public.admin_add_sms_credits(%L, 0)', pg_temp.id('biza'))) ->> 'code') || ':' || (select balance::text from public.sms_credit_accounts where business_id = pg_temp.id('biza')), 'invalid_amount:1500');
select pg_temp.chk('SMS credits: a negative adjustment past the balance refused, balance intact',
  (pg_temp.adm(format('select public.admin_add_sms_credits(%L, -99999)', pg_temp.id('biza'))) ->> 'code') || ':' || (select balance::text from public.sms_credit_accounts where business_id = pg_temp.id('biza')), 'insufficient:1500');
select pg_temp.adm($q$select public.admin_set_sms_rate('92', 'PK', 55, 'pk rate')$q$);
select pg_temp.chk('SMS rate upsert stored + audited',
  (select credits_per_segment::text from public.sms_country_rates where dial_code = '92') || ':' ||
  (select (after ->> 'credits_per_segment') from public.audit_logs where action = 'sms.rate_changed' and entity_id = '92' order by id desc limit 1), '55:55');

do $$
declare v_before int := pg_temp.audits('admin.support_view'); r jsonb;
begin
  r := pg_temp.adm(format('select public.support_view_business(%L)', pg_temp.id('biza')));
  perform pg_temp.chk('support view: ok, plan, staff', (r ->> 'ok') || ':' || (r ->> 'plan') || ':' || (r ->> 'staff_active'), 'true:team:6');
  perform pg_temp.chk('support view: branches listed with currency', (r -> 'branches' -> 0 ->> 'currency'), 'GBP');
  perform pg_temp.chk('support view: enabled add-ons', r -> 'addons_enabled', '["inventory", "packages"]'::jsonb);
  perform pg_temp.chk('support view returns no client PII keys',
    (select count(*)::int from jsonb_object_keys(r) k where k in ('clients', 'client', 'phones', 'emails', 'notes')), 0);
  r := pg_temp.adm(format('select public.support_view_business(%L)', pg_temp.id('biza')));
  perform pg_temp.chk('EVERY support view call is audited (2 calls = 2 rows)', pg_temp.audits('admin.support_view') - v_before, 2);
  perform pg_temp.chk('support view: unknown business, no audit row', (pg_temp.adm(format('select public.support_view_business(%L)', gen_random_uuid())) ->> 'code') || ':' || (pg_temp.audits('admin.support_view') - v_before), 'not_found:2');
end $$;

do $$
declare r jsonb; r2 jsonb; r3 jsonb; v_before int;
begin
  r := pg_temp.adm($q$select public.list_businesses('P8 ', null, null, 2)$q$);
  perform pg_temp.chk('list: page 1 has 2 items and a cursor', jsonb_array_length(r -> 'items')::text || ':' || (r ->> 'next_cursor' is not null)::text, '2:true');
  r2 := pg_temp.adm(format($q$select public.list_businesses('P8 ', null, null, 2, %L, %L)$q$, r -> 'next_cursor' ->> 'created_at', r -> 'next_cursor' ->> 'id'));
  perform pg_temp.chk('list: page 2 continues without overlap',
    (select count(distinct i ->> 'id')::int from (select jsonb_array_elements(r -> 'items') i union all select jsonb_array_elements(r2 -> 'items')) q), jsonb_array_length(r -> 'items') + jsonb_array_length(r2 -> 'items'));
  perform pg_temp.chk('list: the 4 P8 businesses are all reachable across 2 pages, then no cursor',
    (jsonb_array_length(r -> 'items') + jsonb_array_length(r2 -> 'items'))::text || ':' || (r2 ->> 'next_cursor' is null)::text, '4:true');
  perform pg_temp.chk('list: the last page has no cursor', (pg_temp.adm($q$select public.list_businesses('P8 ', null, null, 100)$q$) ->> 'next_cursor' is null)::text, 'true');
  perform pg_temp.chk('list: search < 2 chars refused', pg_temp.adm($q$select public.list_businesses('a')$q$) ->> 'code', 'search_too_short');
  perform pg_temp.chk('list: search finds by name', jsonb_array_length(pg_temp.adm($q$select public.list_businesses('Alpha')$q$) -> 'items'), 1);
  perform pg_temp.chk('list: search finds by slug', jsonb_array_length(pg_temp.adm($q$select public.list_businesses('p8-gamma')$q$) -> 'items'), 1);
  perform pg_temp.chk('list: a LIKE wildcard is escaped (matches nothing)', jsonb_array_length(pg_temp.adm($q$select public.list_businesses('%%')$q$) -> 'items'), 0);
  perform pg_temp.chk('list: status filter (trialing P8s: the trial one only)', jsonb_array_length(pg_temp.adm($q$select public.list_businesses('P8 ', 'trialing')$q$) -> 'items'), 1);
  perform pg_temp.chk('list: plan filter (team: A and the downgraded B)', (select string_agg(i ->> 'slug', ',' order by i ->> 'slug') from jsonb_array_elements(pg_temp.adm($q$select public.list_businesses('P8 ', null, 'team')$q$) -> 'items') i), 'p8-alpha,p8-beta');
  perform pg_temp.chk('list: counts per row', (select (i ->> 'staff_count') || ':' || (i ->> 'branch_count') from jsonb_array_elements(pg_temp.adm($q$select public.list_businesses('Alpha')$q$) -> 'items') i), '6:1');
  perform pg_temp.chk('list: invalid status / plan / cursor',
    (pg_temp.adm($q$select public.list_businesses(null, 'x')$q$) ->> 'code') || ':' || (pg_temp.adm($q$select public.list_businesses(null, null, 'x')$q$) ->> 'code') || ':' || (pg_temp.adm(format($q$select public.list_businesses(null, null, null, 20, now(), null)$q$)) ->> 'code'),
    'invalid_status:invalid_plan:invalid_cursor');
  perform pg_temp.chk('list: limit is capped at 100', (select count(*) <= 100 from jsonb_array_elements(pg_temp.adm($q$select public.list_businesses(null, null, null, 100000)$q$) -> 'items')), true);
  v_before := pg_temp.audits('admin.list_businesses');
  perform pg_temp.adm(format($q$select public.list_businesses('P8 ', null, null, 2, %L, %L)$q$, r -> 'next_cursor' ->> 'created_at', r -> 'next_cursor' ->> 'id'));
  perform pg_temp.chk('list: later pages are NOT logged, first pages are', pg_temp.audits('admin.list_businesses') - v_before, 0);
  perform pg_temp.adm($q$select public.list_businesses('P8 ')$q$);
  perform pg_temp.chk('...a first page adds one row', pg_temp.audits('admin.list_businesses') - v_before, 1);
end $$;

-- ===========================================================================
-- 11. Prices, presets, review takedown
-- ===========================================================================
select pg_temp.adm($q$select public.set_plan_prices('team', 4500, 44280, 'GBP', 'Team Plus', true)$q$);
select pg_temp.chk('set_plan_prices stored + audited',
  (select price_monthly_minor::text || ':' || price_annual_minor::text || ':' || currency || ':' || name from public.plans where key = 'team') || ':' ||
  (select (before ->> 'monthly') || '>' || (after ->> 'monthly') from public.audit_logs where action = 'admin.set_plan_prices' and entity_id = 'team' order by id desc limit 1),
  '4500:44280:GBP:Team Plus:3900>4500');
select pg_temp.chk('set_plan_prices: bad input leaves the row alone',
  (pg_temp.adm($q$select public.set_plan_prices('team', -5, 1, 'GBP')$q$) ->> 'code') || ':' || (pg_temp.adm($q$select public.set_plan_prices('team', 1, 1, 'gbp')$q$) ->> 'code') || ':' || (pg_temp.adm($q$select public.set_plan_prices('gold', 1, 1, 'GBP')$q$) ->> 'code') || ':' || (select price_monthly_minor::text from public.plans where key = 'team'),
  'invalid_input:invalid_input:not_found:4500');
select pg_temp.chk('deactivating a plan blocks assigning it',
  (pg_temp.adm($q$select public.set_plan_prices('solo', 1500, 14760, 'USD', null, false)$q$) ->> 'ok') || ':' || (pg_temp.adm(format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizt'))) ->> 'code'), 'true:invalid_plan');
select pg_temp.adm($q$select public.set_plan_prices('solo', 1500, 14760, 'USD', null, true)$q$);
select pg_temp.adm($q$select public.set_addon_prices('inventory', 1100, 'USD', 'Stock', true)$q$);
select pg_temp.chk('set_addon_prices stored', (select price_monthly_minor::text || name from public.addons where key = 'inventory'), '1100Stock');
select pg_temp.chk('set_addon_prices unknown key', pg_temp.adm($q$select public.set_addon_prices('waitlist', 1, 'USD')$q$) ->> 'code', 'not_found');
select pg_temp.chk('an owner can read plans but not write them',
  (pg_temp.try_as(pg_temp.id('owner'), 'select 1 from public.plans') = 'ok:3')::text || ':' ||
  pg_temp.try_as(pg_temp.id('owner'), $q$update public.plans set price_monthly_minor = 1 returning 1$q$) || ':' ||
  pg_temp.try_as(pg_temp.id('owner'), $q$insert into public.addons (key, name, price_monthly_minor) values ('x1', 'X', 1) returning 1$q$), 'true:ERR:42501:ERR:42501');
select pg_temp.chk('anon cannot read plans', pg_temp.call_as(null, false, 'select to_jsonb((select count(*) from public.plans))') ->> 'error', '42501');

select pg_temp.chk('preset: created',
  pg_temp.adm($q$select public.upsert_industry_preset('clinic', 'Clinic', '{"client":"Patient","staff":"Doctor"}',
    '[{"label":"Allergies","field_type":"long_text","is_sensitive":true},{"label":"Blood group","field_type":"dropdown","options":["A","B","AB","O"]}]', 'clinic')$q$) ->> 'created', 'true');
select pg_temp.chk('preset: stored values',
  (select name || ':' || (terminology ->> 'client') || ':' || jsonb_array_length(starter_custom_fields)::text || ':' || template_key || ':' || (updated_by = pg_temp.id('sadmin'))::text from public.industry_presets where key = 'clinic'), 'Clinic:Patient:2:clinic:true');
select pg_temp.chk('preset: update returns created=false', pg_temp.adm($q$select public.upsert_industry_preset('clinic', 'Clinic 2', '{"client":"Client"}', '[]', 'clinic')$q$) ->> 'created', 'false');
select pg_temp.chk('...and replaced name and fields', (select name || jsonb_array_length(starter_custom_fields)::text from public.industry_presets where key = 'clinic'), 'Clinic 20');
select pg_temp.adm($q$select public.upsert_industry_preset('clinic', 'Clinic', '{"client":"Patient"}', '[{"label":"Allergies","field_type":"long_text"}]', 'clinic')$q$);
do $$
declare v_before text := (select ip::text from public.industry_presets ip where key = 'clinic'); v text;
begin
  for v in select unnest(array[
    $q$select public.upsert_industry_preset('clinic', 'X', '{"client":"P"}', '[{"label":"L","field_type":"checkbox"}]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '{"client":"P"}', '[{"label":"L","field_type":"dropdown","options":["only one"]}]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '{"client":"P"}', '[{"label":"L","field_type":"short_text","options":["a","b"]}]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '{"client":"P"}', '[{"label":"L","field_type":"short_text","evil":1}]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '{"client":"P"}', '[{"field_type":"short_text"}]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '{"client":5}', '[]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '{"Client":"P"}', '[]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '[]', '[]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '{}', '{}', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', 'X', '{}', '[]', 'Bad Key!')$q$,
    $q$select public.upsert_industry_preset('Bad Key', 'X', '{}', '[]', 'clinic')$q$,
    $q$select public.upsert_industry_preset('clinic', '', '{}', '[]', 'clinic')$q$])
  loop
    perform pg_temp.chk('preset invalid payload refused: ' || left(v, 120), coalesce(pg_temp.adm(v) ->> 'code', 'NO CODE ' || pg_temp.adm(v)::text) ~ '^invalid_', true);
  end loop;
  perform pg_temp.chk('...every invalid payload left the stored preset exactly as it was', (select ip::text from public.industry_presets ip where key = 'clinic'), v_before);
  perform pg_temp.chk('...and created no new key', (select count(*)::int from public.industry_presets where key in ('Bad Key', 'bad key!')), 0);
end $$;
select pg_temp.chk('an owner can read presets but not write them',
  pg_temp.try_as(pg_temp.id('owner'), 'select 1 from public.industry_presets') || ':' ||
  pg_temp.try_as(pg_temp.id('owner'), $q$delete from public.industry_presets returning 1$q$), 'ok:1:ERR:42501');

-- review takedown: a real review through the real RPCs (business B is active, 5 staff)
do $$
declare v_svc uuid; v_staff uuid; v_cl uuid; r jsonb; v_appt uuid; v_rev uuid;
begin
  select id into v_staff from public.staff_profiles where business_id = pg_temp.id('bizb') and is_active order by display_name limit 1;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (pg_temp.id('bizb'), 'Cut', 30, 0) returning id into v_svc;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, pg_temp.id('branchb'), pg_temp.id('bizb'), 1000, true);
  insert into public.service_staff (service_id, staff_id, business_id) values (v_svc, v_staff, pg_temp.id('bizb'));
  insert into public.clients (business_id, full_name, phone_e164) values (pg_temp.id('bizb'), 'Rita Review', '+12025550999') returning id into v_cl;
  r := pg_temp.call_as(pg_temp.id('ownerb'), false, format('select public.create_appointment(%L, %L, %L, p_staff_id => %L, p_client_id => %L)',
        pg_temp.id('branchb'), v_svc, date_trunc('hour', now()) + interval '3 days 2 hours', v_staff, v_cl));
  v_appt := (r ->> 'appointment_id')::uuid;
  r := pg_temp.call_as(pg_temp.id('ownerb'), false, format('select public.mark_completed(%L)', v_appt));
  perform pg_temp.chk('review fixture: appointment completed with a review token', (r ->> 'ok') || ':' || (length(r -> 'review_request' ->> 'token') = 64)::text, 'true:true');
  perform public.submit_review(r -> 'review_request' ->> 'token', 2, 'rude staff');
  select id into v_rev from public.reviews where appointment_id = v_appt;
  insert into ids values ('review', v_rev);
  update public.reviews set featured_on_website = true, featured_at = now() where id = v_rev;
end $$;
select pg_temp.chk('review fixture: published and featured', (select status || ':' || featured_on_website::text from public.reviews where id = pg_temp.id('review')), 'published:true');
select pg_temp.chk('remove_review: reason is required, review untouched',
  (pg_temp.adm(format($q$select public.remove_review(%L, '  ')$q$, pg_temp.id('review'))) ->> 'code') || ':' || (select status from public.reviews where id = pg_temp.id('review')), 'reason_required:published');
select pg_temp.chk('remove_review: unknown review', pg_temp.adm($q$select public.remove_review(gen_random_uuid(), 'spam')$q$) ->> 'code', 'not_found');
select pg_temp.chk('the owner cannot remove it', pg_temp.call_as(pg_temp.id('ownerb'), true, format($q$select public.remove_review(%L, 'my own review')$q$, pg_temp.id('review'))) ->> 'code', 'forbidden');
select pg_temp.chk('remove_review ok', pg_temp.adm(format($q$select public.remove_review(%L, 'abusive language')$q$, pg_temp.id('review'))) ->> 'ok', 'true');
select pg_temp.chk('...stored: removed, un-featured, customer words intact',
  (select status || ':' || featured_on_website::text || ':' || rating::text || ':' || comment || ':' || reviewer_first_name from public.reviews where id = pg_temp.id('review')), 'removed:false:2:rude staff:Rita');
select pg_temp.chk('...audit stores the reason and the business',
  (select (after ->> 'reason') || ':' || (before ->> 'status') || ':' || (business_id = pg_temp.id('bizb'))::text from public.audit_logs where action = 'admin.remove_review' and entity_id = pg_temp.id('review')::text), 'abusive language:published:true');
select pg_temp.chk('remove_review twice: already_removed', pg_temp.adm(format($q$select public.remove_review(%L, 'again')$q$, pg_temp.id('review'))) ->> 'code', 'already_removed');
select pg_temp.chk('a removed review cannot be re-featured',
  pg_temp.msg(format($q$update public.reviews set featured_on_website = true where id = %L$q$, pg_temp.id('review'))) like '%featured_needs_published%', 'true');
select pg_temp.chk('the owner still cannot edit the customer''s words',
  pg_temp.msg(format($q$update public.reviews set comment = 'lovely' where id = %L$q$, pg_temp.id('review'))), 'a submitted review cannot be edited');

-- ===========================================================================
-- 12. Direct-write refusals, privacy of notes, grants
-- ===========================================================================
select pg_temp.chk('owner reads their own subscription (public columns)',
  pg_temp.try_as(pg_temp.id('owner'), format($q$select plan, status, trial_ends_at from public.business_subscriptions where business_id = %L$q$, pg_temp.id('biza'))), 'ok:1');
select pg_temp.chk('...but NOT the internal notes column',
  pg_temp.try_as(pg_temp.id('owner'), format($q$select notes from public.business_subscriptions where business_id = %L$q$, pg_temp.id('biza'))), 'ERR:42501');
select pg_temp.chk('...nor assigned_by',
  pg_temp.try_as(pg_temp.id('owner'), format($q$select assigned_by from public.business_subscriptions where business_id = %L$q$, pg_temp.id('biza'))), 'ERR:42501');
select pg_temp.chk('another business reads nothing of it',
  pg_temp.try_as(pg_temp.id('ownerb'), format($q$select plan from public.business_subscriptions where business_id = %L$q$, pg_temp.id('biza'))), 'ok:0');
select pg_temp.chk('owner cannot write subscriptions / addons directly',
  pg_temp.try_as(pg_temp.id('owner'), format($q$update public.business_subscriptions set plan = 'business' where business_id = %L returning 1$q$, pg_temp.id('biza'))) || ':' ||
  pg_temp.try_as(pg_temp.id('owner'), format($q$insert into public.business_addons (business_id, addon_key, enabled) values (%L, 'inventory', true) returning 1$q$, pg_temp.id('biza'))), 'ERR:42501:ERR:42501');
select pg_temp.chk('owner reads own add-on rows', pg_temp.try_as(pg_temp.id('owner'), format($q$select 1 from public.business_addons where business_id = %L$q$, pg_temp.id('biza'))), 'ok:3');
select pg_temp.chk('anon: no table privilege on the new tables',
  (select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'
    and table_name in ('plans', 'addons', 'business_subscriptions', 'business_addons', 'industry_presets')), 0);
select pg_temp.chk('authenticated holds only SELECT on the new tables',
  (select count(*)::int from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public'
    and table_name in ('plans', 'addons', 'business_subscriptions', 'business_addons', 'industry_presets') and privilege_type <> 'SELECT'), 0);
select pg_temp.chk('all 13 super admin RPCs: authenticated yes, anon no',
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('list_businesses','get_business_detail','assign_plan','set_business_status','set_addon','extend_trial','admin_add_sms_credits','admin_set_sms_rate','set_plan_prices','set_addon_prices','upsert_industry_preset','remove_review','support_view_business')
      and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') and p.prosecdef), 13);
select pg_temp.chk('internal gating helpers are not callable by anon/authenticated',
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_gate','business_has_feature','business_plan_limits','feature_gate_error','plan_limit_violations','check_staff_cap','widget_feature_enabled','create_business_subscription','sync_business_from_subscription')
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))), 0);
select pg_temp.chk('the staff / branch / role guard triggers exist',
  (select count(*)::int from pg_trigger where tgname in ('staff_branches_enforce_cap', 'staff_profiles_enforce_cap', 'branches_enforce_limit', 'roles_enforce_custom_roles_feature', 'business_subscriptions_sync', 'businesses_create_subscription') and not tgisinternal), 6);

-- ===========================================================================
-- 12b. is_super_admin() needs aal2 EVERYWHERE; admin notes never reach owners
-- ===========================================================================
select pg_temp.chk('is_super_admin(): flag + aal1 session is false, flag + aal2 true',
  (pg_temp.call_as(pg_temp.id('sadmin'), false, 'select to_jsonb(public.is_super_admin())')::text) || ':' ||
  (pg_temp.call_as(pg_temp.id('sadmin'), true, 'select to_jsonb(public.is_super_admin())')::text), 'false:true');
do $$
declare t text; v_lo jsonb; v_hi jsonb; v_other jsonb;
begin
  foreach t in array array['businesses','branches','business_members','staff_profiles','clients','appointments','invoices',
                           'audit_logs','profiles','reviews','sms_credit_ledger','business_subscriptions','message_outbox','messages'] loop
    v_lo := pg_temp.call_as(pg_temp.id('sadmin'), false, format('select to_jsonb((select count(*) from public.%I))', t));
    v_hi := pg_temp.call_as(pg_temp.id('sadmin'), true, format('select to_jsonb((select count(*) from public.%I))', t));
    -- aal1 super admin is just a stranger: only their OWN profile row is visible
    perform pg_temp.chk('aal1 super admin sees nothing in ' || t, coalesce(v_lo::text, 'null'), case when t = 'profiles' then '1' else '0' end);
    if t in ('businesses', 'branches', 'business_members', 'audit_logs', 'business_subscriptions') then
      perform pg_temp.chk('aal2 super admin does read ' || t, (v_hi::text)::int > 0, true);
    end if;
  end loop;
end $$;

-- the same marker goes into every admin note field; no owner-readable audit row may contain it
select pg_temp.adm(format($q$select public.assign_plan(%L, 'team', null, 'ZZNOTE-assign')$q$, pg_temp.id('biza')));
select pg_temp.adm(format($q$select public.set_business_status(%L, 'active', 'ZZNOTE-status')$q$, pg_temp.id('biza')));
select pg_temp.adm(format($q$select public.admin_add_sms_credits(%L, 10, 'ZZNOTE-credits')$q$, pg_temp.id('biza')));
select pg_temp.adm($q$select public.admin_set_sms_rate('92', 'PK', 56, 'ZZNOTE-rate')$q$);
select pg_temp.chk('the notes WERE stored where members cannot read them',
  (select notes from public.business_subscriptions where business_id = pg_temp.id('biza')), 'ZZNOTE-status');
select pg_temp.chk('NO audit row at all contains any admin note text',
  (select count(*)::int from public.audit_logs where before::text like '%ZZNOTE%' or after::text like '%ZZNOTE%' or action like '%ZZNOTE%' or entity_id like '%ZZNOTE%'), 0);
select pg_temp.chk('...so the owner reads none either',
  pg_temp.try_as(pg_temp.id('owner'), $q$select 1 from public.audit_logs where before::text like '%ZZNOTE%' or after::text like '%ZZNOTE%'$q$), 'ok:0');

-- ===========================================================================
-- 13. Business delete cascade releases every new row (triggers must not block it)
-- ===========================================================================
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
do $$
begin
  delete from public.businesses where id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc'), pg_temp.id('bizt'));
exception when others then
  perform pg_temp.chk('business delete cascade works with subscriptions/add-ons/staff/branches/reviews: ' || sqlerrm, false, true);
end $$;
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
select pg_temp.chk('cascade removed subscriptions and add-ons',
  (select count(*)::int from public.business_subscriptions where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc'), pg_temp.id('bizt')))
  + (select count(*)::int from public.business_addons where business_id in (pg_temp.id('biza'), pg_temp.id('bizb'), pg_temp.id('bizc'), pg_temp.id('bizt'))), 0);

select n, name, detail from res where not pass order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total,
       coalesce(string_agg(name, ' | ') filter (where not pass), 'none') as failures
from res;
rollback;
