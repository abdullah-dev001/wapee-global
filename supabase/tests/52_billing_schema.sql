-- Polar billing, part 1 (migration 20261027100000): the new tables' access rules, the super
-- admin product mapping and billing source, the overrides that detach (assign_plan, set_addon),
-- the paid add-on window in business_has_feature and paid seats in business_plan_limits.
--
--   supabase db query --linked -f supabase/tests/52_billing_schema.sql
--
-- Plain SQL, own fixtures, ROLLS BACK. Every refusal asserts the STORED rows are exactly as they
-- were (CLAUDE.md section 5). RPC calls and the reads that check them are separate statements.
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create temporary table snap (k text primary key, v text) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
-- Run a jsonb-returning statement as a signed-in user; p_fresh = a password sign-in just now
-- (what a super admin needs since 20261026130000).
create or replace function pg_temp.as_(p_user text, p_sql text, p_fresh boolean default false) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated', 'aal', 'aal1',
    'amr', case when p_fresh then json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint))
                else '[]'::json end)::text, true);
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
create or replace function pg_temp.adm(p_sql text) returns jsonb language sql as $$ select pg_temp.as_('sadmin', p_sql, true) $$;
create or replace function pg_temp.q(p_sql text) returns text language plpgsql as $$
declare v text;
begin execute p_sql into v; return v; end $$;
create or replace function pg_temp.products() returns text language sql as $$
  select coalesce(string_agg(polar_product_id || '|' || kind || '|' || key || '|' || interval || '|' || active, ';' order by polar_product_id), '')
  from public.billing_products where polar_product_id like 'bs52-%'
$$;
create or replace function pg_temp.subrow(p_biz text) returns text language sql as $$
  select plan || '|' || status || '|' || billing_source || '|' || coalesce(polar_detached_at::text, '-') || '|' || coalesce(current_period_end::text, '-')
  from public.business_subscriptions where business_id = pg_temp.id(p_biz)
$$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select on %I.ids to authenticated, anon', v_schema);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: owner of A, manager of A, owner of B, a super admin.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values ('owner'), ('mgr'), ('ownerb'), ('sadmin')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bs52.' || r.k || '@example.com',
            extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
            '{"provider":"email","providers":["email"]}', '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
end $$;
alter table public.profiles disable trigger profiles_enforce_guard;
update public.profiles set is_super_admin = true where id = pg_temp.id('sadmin');
alter table public.profiles enable trigger profiles_enforce_guard;

do $$
declare v_biz uuid; v_m uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('BS52 Alpha','bs52-alpha-check','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('biza', v_biz);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('ownerb'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('BS52 Beta','bs52-beta-check','GB','GBP','Europe/London','en',null,'Main');
  reset role; insert into ids values ('bizb', v_biz);

  perform set_config('request.jwt.claims', '', true);
  insert into public.business_members (business_id, user_id, status, joined_at)
  values (pg_temp.id('biza'), pg_temp.id('mgr'), 'active', now()) returning id into v_m;
  insert into public.member_role_assignments (member_id, role_id, branch_id)
  values (v_m, (select id from public.roles where business_id is null and key = 'manager'), null);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Access rules of the new tables and columns
-- ---------------------------------------------------------------------------
select pg_temp.chk('RLS on: billing_products, billing_subscriptions, billing_webhook_events',
  (select string_agg(relname || ':' || relrowsecurity, ',' order by relname) from pg_class
   where relnamespace = 'public'::regnamespace and relname in ('billing_products', 'billing_subscriptions', 'billing_webhook_events')),
  'billing_products:true,billing_subscriptions:true,billing_webhook_events:true');
select pg_temp.chk('authenticated cannot read billing_subscriptions (no grant)',
  pg_temp.as_('owner', 'select to_jsonb(count(*)) from public.billing_subscriptions') ->> 'state', '42501');
select pg_temp.chk('authenticated cannot read billing_webhook_events (no grant)',
  pg_temp.as_('owner', 'select to_jsonb(count(*)) from public.billing_webhook_events') ->> 'state', '42501');
select pg_temp.chk('owner cannot read business_subscriptions.billing_source (column not granted)',
  pg_temp.as_('owner', format('select to_jsonb(billing_source) from public.business_subscriptions where business_id = %L', pg_temp.id('biza'))) ->> 'state', '42501');
select pg_temp.chk('owner still reads the granted business_subscriptions columns',
  pg_temp.as_('owner', format('select to_jsonb(status::text) from public.business_subscriptions where business_id = %L', pg_temp.id('biza'))) #>> '{}', 'trialing');
select pg_temp.chk('anon has no privilege on the new tables',
  (has_table_privilege('anon', 'public.billing_products', 'SELECT') or has_table_privilege('anon', 'public.billing_subscriptions', 'SELECT')
   or has_table_privilege('anon', 'public.billing_webhook_events', 'SELECT'))::text, 'false');
select pg_temp.chk('billing_paid_seats is internal (no EXECUTE for authenticated)',
  has_function_privilege('authenticated', 'public.billing_paid_seats(uuid)', 'EXECUTE')::text, 'false');
select pg_temp.chk('every new business starts manual, not detached',
  (select billing_source || '|' || coalesce(polar_detached_at::text, '-') from public.business_subscriptions where business_id = pg_temp.id('biza')), 'manual|-');

-- ---------------------------------------------------------------------------
-- 2. set_billing_product
-- ---------------------------------------------------------------------------
insert into snap values ('p0', pg_temp.products());
select pg_temp.chk('set_billing_product: owner forbidden',
  pg_temp.as_('owner', $q$select public.set_billing_product('bs52-team-m', 'plan', 'team', 'month')$q$) ->> 'code', 'forbidden');
select pg_temp.chk('set_billing_product: super admin without a fresh password session refused',
  pg_temp.as_('sadmin', $q$select public.set_billing_product('bs52-team-m', 'plan', 'team', 'month')$q$, false) ->> 'code', 'reauth_required');
select pg_temp.chk('set_billing_product: bad kind', pg_temp.adm($q$select public.set_billing_product('bs52-team-m', 'seat', 'team', 'month')$q$) ->> 'code', 'invalid_input');
select pg_temp.chk('set_billing_product: bad interval', pg_temp.adm($q$select public.set_billing_product('bs52-team-m', 'plan', 'team', 'week')$q$) ->> 'code', 'invalid_input');
select pg_temp.chk('set_billing_product: blank id', pg_temp.adm($q$select public.set_billing_product('  ', 'plan', 'team', 'month')$q$) ->> 'code', 'invalid_input');
select pg_temp.chk('set_billing_product: unknown plan', pg_temp.adm($q$select public.set_billing_product('bs52-gold-m', 'plan', 'gold', 'month')$q$) ->> 'code', 'not_found');
select pg_temp.chk('set_billing_product: unknown add-on', pg_temp.adm($q$select public.set_billing_product('bs52-x-m', 'addon', 'waitlist', 'month')$q$) ->> 'code', 'not_found');
select pg_temp.chk('...nothing stored after every refusal', pg_temp.products(), (select v from snap where k = 'p0'));

select pg_temp.chk('set_billing_product: ok (plan)', pg_temp.adm($q$select public.set_billing_product(' bs52-team-m ', 'plan', 'team', 'month')$q$) ->> 'ok', 'true');
select pg_temp.chk('set_billing_product: ok (add-on)', pg_temp.adm($q$select public.set_billing_product('bs52-inv-y', 'addon', 'inventory', 'year')$q$) ->> 'ok', 'true');
select pg_temp.chk('...stored trimmed', pg_temp.products(), 'bs52-inv-y|addon|inventory|year|true;bs52-team-m|plan|team|month|true');
insert into snap values ('p1', pg_temp.products());
select pg_temp.chk('set_billing_product: a second ACTIVE product for team/month refused',
  pg_temp.adm($q$select public.set_billing_product('bs52-team-m2', 'plan', 'team', 'month')$q$) ->> 'code', 'duplicate_product');
select pg_temp.chk('set_billing_product: an id cannot change meaning (team -> solo)',
  pg_temp.adm($q$select public.set_billing_product('bs52-team-m', 'plan', 'solo', 'month')$q$) ->> 'code', 'product_in_use');
select pg_temp.chk('...stored rows unchanged', pg_temp.products(), (select v from snap where k = 'p1'));
select pg_temp.chk('set_billing_product: deactivate', pg_temp.adm($q$select public.set_billing_product('bs52-team-m', 'plan', 'team', 'month', false)$q$) ->> 'ok', 'true');
select pg_temp.chk('...then a new active team/month is allowed',
  pg_temp.adm($q$select public.set_billing_product('bs52-team-m2', 'plan', 'team', 'month')$q$) ->> 'ok', 'true');
select pg_temp.chk('set_billing_product: audited (business null, by the super admin)',
  (select count(*)::text from public.audit_logs where action = 'admin.set_billing_product' and entity_id like 'bs52-%'
     and business_id is null and actor_user_id = pg_temp.id('sadmin')), '4');
select pg_temp.chk('billing_products: owner reads nothing (super admin only)',
  pg_temp.as_('owner', $q$select to_jsonb(count(*)) from public.billing_products where polar_product_id like 'bs52-%'$q$) #>> '{}', '0');
select pg_temp.chk('billing_products: super admin reads them',
  pg_temp.adm($q$select to_jsonb(count(*)) from public.billing_products where polar_product_id like 'bs52-%'$q$) #>> '{}', '3');

-- ---------------------------------------------------------------------------
-- 3. set_billing_source
-- ---------------------------------------------------------------------------
insert into snap values ('s0', pg_temp.subrow('biza'));
select pg_temp.chk('set_billing_source: owner forbidden',
  pg_temp.as_('owner', format('select public.set_billing_source(%L, %L)', pg_temp.id('biza'), 'polar')) ->> 'code', 'forbidden');
select pg_temp.chk('set_billing_source: bad source',
  pg_temp.adm(format('select public.set_billing_source(%L, %L)', pg_temp.id('biza'), 'stripe')) ->> 'code', 'invalid_input');
select pg_temp.chk('set_billing_source: unknown business',
  pg_temp.adm(format('select public.set_billing_source(%L, %L)', gen_random_uuid(), 'polar')) ->> 'code', 'not_found');
select pg_temp.chk('set_billing_source: same source = no change',
  pg_temp.adm(format('select public.set_billing_source(%L, %L)', pg_temp.id('biza'), 'manual')) ->> 'changed', 'false');
select pg_temp.chk('...row unchanged after every refusal', pg_temp.subrow('biza'), (select v from snap where k = 's0'));
select pg_temp.chk('set_billing_source: -> polar',
  pg_temp.adm(format('select public.set_billing_source(%L, %L)', pg_temp.id('biza'), 'polar')) ->> 'changed', 'true');
select pg_temp.chk('...polar, no detach time',
  (select billing_source || '|' || coalesce(polar_detached_at::text, '-') from public.business_subscriptions where business_id = pg_temp.id('biza')), 'polar|-');
select pg_temp.chk('set_billing_source: -> manual',
  pg_temp.adm(format('select public.set_billing_source(%L, %L)', pg_temp.id('biza'), 'manual')) ->> 'changed', 'true');
select pg_temp.chk('...manual with a detach time',
  (select billing_source || '|' || (polar_detached_at is not null)::text from public.business_subscriptions where business_id = pg_temp.id('biza')), 'manual|true');
select pg_temp.chk('set_billing_source: audited twice',
  (select count(*)::text from public.audit_logs where business_id = pg_temp.id('biza') and action = 'admin.set_billing_source'), '2');

-- ---------------------------------------------------------------------------
-- 4. assign_plan / set_addon detach
-- ---------------------------------------------------------------------------
-- B is Polar-billed; a manual plan assignment takes it off Polar.
update public.business_subscriptions set billing_source = 'polar', polar_detached_at = null where business_id = pg_temp.id('bizb');
select pg_temp.chk('assign_plan on a Polar business: ok',
  pg_temp.adm(format($q$select public.assign_plan(%L, 'team', null, 'bank transfer')$q$, pg_temp.id('bizb'))) ->> 'ok', 'true');
select pg_temp.chk('...now manual, detached, team, active',
  (select plan || '|' || status || '|' || billing_source || '|' || (polar_detached_at is not null)::text from public.business_subscriptions where business_id = pg_temp.id('bizb')),
  'team|active|manual|true');
insert into snap values ('det_b', (select polar_detached_at::text from public.business_subscriptions where business_id = pg_temp.id('bizb')));
select pg_temp.chk('assign_plan again (already manual): ok',
  pg_temp.adm(format($q$select public.assign_plan(%L, 'solo')$q$, pg_temp.id('bizb'))) ->> 'ok', 'true');
select pg_temp.chk('...detach time kept',
  (select polar_detached_at::text from public.business_subscriptions where business_id = pg_temp.id('bizb')), (select v from snap where k = 'det_b'));
insert into snap values ('det_a', (select polar_detached_at::text from public.business_subscriptions where business_id = pg_temp.id('biza')));
select pg_temp.chk('assign_plan on a manual business: ok',
  pg_temp.adm(format($q$select public.assign_plan(%L, 'team')$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('...still manual, detach time untouched',
  (select billing_source || '|' || polar_detached_at::text from public.business_subscriptions where business_id = pg_temp.id('biza')),
  'manual|' || (select v from snap where k = 'det_a'));

-- A Polar-paid add-on, then a manual override.
insert into public.business_addons (business_id, addon_key, enabled, source, access_until)
values (pg_temp.id('biza'), 'inventory', true, 'polar', now() + interval '10 days');
select pg_temp.chk('set_addon on a Polar add-on: ok',
  pg_temp.adm(format($q$select public.set_addon(%L, 'inventory', true)$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('...manual, no paid end, detached',
  (select enabled || '|' || source || '|' || coalesce(access_until::text, '-') || '|' || (polar_detached_at is not null)::text
   from public.business_addons where business_id = pg_temp.id('biza') and addon_key = 'inventory'), 'true|manual|-|true');
select pg_temp.chk('set_addon on a new add-on: ok',
  pg_temp.adm(format($q$select public.set_addon(%L, 'packages', false)$q$, pg_temp.id('biza'))) ->> 'ok', 'true');
select pg_temp.chk('...manual, never detached',
  (select source || '|' || coalesce(polar_detached_at::text, '-') from public.business_addons where business_id = pg_temp.id('biza') and addon_key = 'packages'),
  'manual|-');

-- ---------------------------------------------------------------------------
-- 5. business_has_feature: the paid add-on window
-- ---------------------------------------------------------------------------
-- A is on Team (active, no end). files_photos is an add-on Team does not include.
insert into public.business_addons (business_id, addon_key, enabled, source, access_until)
values (pg_temp.id('biza'), 'files_photos', true, 'polar', now() + interval '1 day');
select pg_temp.chk('paid add-on before its end: on', public.business_has_feature(pg_temp.id('biza'), 'files_photos')::text, 'true');
update public.business_addons set access_until = now() - interval '1 second' where business_id = pg_temp.id('biza') and addon_key = 'files_photos';
select pg_temp.chk('paid add-on after its end: off', public.business_has_feature(pg_temp.id('biza'), 'files_photos')::text, 'false');
update public.business_addons set access_until = null where business_id = pg_temp.id('biza') and addon_key = 'files_photos';
select pg_temp.chk('manual add-on (no end): on', public.business_has_feature(pg_temp.id('biza'), 'files_photos')::text, 'true');
update public.business_addons set enabled = false where business_id = pg_temp.id('biza') and addon_key = 'files_photos';
select pg_temp.chk('disabled add-on: off', public.business_has_feature(pg_temp.id('biza'), 'files_photos')::text, 'false');

-- ---------------------------------------------------------------------------
-- 6. business_plan_limits: paid seats of a Polar Business plan
-- ---------------------------------------------------------------------------
update public.business_subscriptions set plan = 'business', status = 'active', billing_source = 'polar', polar_detached_at = null,
  current_period_end = now() + interval '30 days' where business_id = pg_temp.id('biza');
select pg_temp.chk('Business, Polar, no live subscription: unlimited (plan default)',
  coalesce(public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches', 'null'), 'null');
insert into public.billing_subscriptions (polar_subscription_id, business_id, polar_customer_id, polar_product_id, kind, key, interval,
  polar_status, seats, live, access_until, polar_created_at, polar_modified_at)
values ('bs52-sub-1', pg_temp.id('biza'), 'cus', 'bs52-biz-m', 'plan', 'business', 'month', 'active', 3, true, now() + interval '37 days', now() - interval '1 hour', now());
select pg_temp.chk('Business, Polar, 3 paid seats: max 3 locations',
  public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches', '3');
update public.business_subscriptions set polar_detached_at = now() where business_id = pg_temp.id('biza');
select pg_temp.chk('a subscription created before the detach time does not count',
  coalesce(public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches', 'null'), 'null');
update public.business_subscriptions set billing_source = 'manual' where business_id = pg_temp.id('biza');
select pg_temp.chk('manual Business plan: unlimited again',
  coalesce(public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches', 'null'), 'null');
update public.business_subscriptions set billing_source = 'polar', polar_detached_at = null where business_id = pg_temp.id('biza');
update public.billing_subscriptions set live = false where polar_subscription_id = 'bs52-sub-1';
select pg_temp.chk('ended subscription: no paid seats',
  coalesce(public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches', 'null'), 'null');
update public.billing_subscriptions set live = true, seats = 1 where polar_subscription_id = 'bs52-sub-1';
select pg_temp.chk('Team stays one location regardless of seats',
  (select pg_temp.q(format($q$
     with u as (update public.business_subscriptions set plan = 'team' where business_id = %L returning 1)
     select count(*)::text from u$q$, pg_temp.id('biza'))) || '|' || (public.business_plan_limits(pg_temp.id('biza')) ->> 'max_branches')), '1|1');
update public.business_subscriptions set plan = 'business' where business_id = pg_temp.id('biza');
do $$
declare v_err text := 'none';
begin
  begin
    insert into public.branches (business_id, name, country_code, currency, timezone, invoice_prefix)
    values (pg_temp.id('biza'), 'Second', 'GB', 'GBP', 'Europe/London', 'BS52B');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.chk('...second location with 1 paid seat refused', v_err, 'branch_limit_reached');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Deleting a business with billing rows cascades
-- ---------------------------------------------------------------------------
insert into public.billing_webhook_events (webhook_id, event_type, business_id) values ('bs52-evt-1', 'subscription.updated', pg_temp.id('biza'));
select pg_temp.chk('delete from businesses with billing rows: ok',
  pg_temp.q(format($q$with d as (delete from public.businesses where id = %L returning 1) select count(*)::text from d$q$, pg_temp.id('biza'))), '1');
select pg_temp.chk('...its billing subscriptions are gone',
  (select count(*)::text from public.billing_subscriptions where polar_subscription_id = 'bs52-sub-1'), '0');
select pg_temp.chk('...its webhook event rows stay, unlinked',
  (select coalesce(business_id::text, 'null') from public.billing_webhook_events where webhook_id = 'bs52-evt-1'), 'null');

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total,
  coalesce(string_agg(n || ' ' || name || ': ' || detail, E'\n' order by n) filter (where not pass), '') as failures
from res;

rollback;
