-- Polar billing, part 3 (migration 20261027120000): billing_prepare (what the `billing` Edge
-- Function asks before every Polar call), reconcile targets, event cleanup, the daily cron.
--
--   supabase db query --linked -f supabase/tests/54_billing_actions.sql
--
-- Plain SQL, own fixtures, ROLLS BACK. billing_prepare writes nothing but the rate-limit count and
-- one audit row on success: every refusal asserts the billing state of the business is exactly
-- as it was (CLAUDE.md section 5).
begin;

create temporary table ids (k text primary key, v uuid) on commit drop;
create temporary table res (n int generated always as identity, name text, pass boolean, detail text) on commit drop;
create temporary table snap (k text primary key, v text) on commit drop;
create temporary table out (k text primary key, v jsonb) on commit drop;

create or replace function pg_temp.id(text) returns uuid language sql as $$ select v from ids where k = $1 $$;
create or replace function pg_temp.chk(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  insert into res (name, pass, detail)
  values (p_name, p_got is not distinct from p_want, 'got ' || coalesce(p_got, '<null>') || ' want ' || coalesce(p_want, '<null>'));
end; $$;
create or replace function pg_temp.as_(p_user text, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into r;
  exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate, 'msg', sqlerrm); end;
  reset role;
  return r;
end $$;
create or replace function pg_temp.as_anon(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin execute p_sql into r;
  exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate); end;
  reset role;
  return r;
end $$;
-- billing_prepare as a user.
create or replace function pg_temp.prep(p_user text, p_biz text, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select pg_temp.as_(p_user, format('select public.billing_prepare(%L, %L, %L::jsonb)', pg_temp.id(p_biz), p_action, p_args))
$$;
create or replace function pg_temp.code(p_user text, p_biz text, p_action text, p_args jsonb default '{}'::jsonb) returns text language sql as $$
  select coalesce(r ->> 'code', case when (r ->> 'ok') = 'true' then 'ok' end, r ->> 'state')
  from (select pg_temp.prep(p_user, p_biz, p_action, p_args) r) x
$$;
create or replace function pg_temp.snapshot(p_id text, p_biz text, p_product text, p_status text, p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'customer_id', 'cus_' || p_biz, 'external_customer_id', pg_temp.id(p_biz), 'metadata_business_id', null,
    'product_id', p_product, 'status', p_status,
    'recurring_interval', (select interval from public.billing_products where polar_product_id = p_product),
    'seats', null, 'cancel_at_period_end', false,
    'current_period_start', now() - interval '1 day', 'current_period_end', now() + interval '29 days',
    'ended_at', null, 'past_due_at', null, 'created_at', now() - interval '1 day', 'modified_at', now() - interval '1 hour') || p_over
$$;
create or replace function pg_temp.apply(p_snapshot jsonb) returns text language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  r := public.billing_apply_subscription(p_snapshot);
  return r ->> 'code';
end $$;
-- The billing state that a refusal must leave untouched (audit counted separately).
create or replace function pg_temp.bstate(p_biz text) returns text language sql as $$
  select concat_ws(' # ',
    (select plan || '|' || status || '|' || billing_source || '|' || coalesce(current_period_end::text, '-') from public.business_subscriptions where business_id = pg_temp.id(p_biz)),
    (select coalesce(string_agg(polar_subscription_id || '|' || polar_status || '|' || live || '|' || cancel_at_period_end || '|' || coalesce(seats::text, '-'), ';' order by 1), 'none')
     from public.billing_subscriptions where business_id = pg_temp.id(p_biz)),
    (select coalesce(string_agg(addon_key || '|' || enabled || '|' || source, ';' order by 1), 'none') from public.business_addons where business_id = pg_temp.id(p_biz)))
$$;
create or replace function pg_temp.audits(p_biz text) returns text language sql as $$
  select count(*)::text from public.audit_logs where business_id = pg_temp.id(p_biz)
$$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select on %I.ids to authenticated, anon', v_schema);
end $$;

-- Generous limits for the suite (section 2 tests the limiter with its own business).
update public.rate_limit_rules set max_attempts = 100000 where endpoint = 'billing_action';

-- ---------------------------------------------------------------------------
-- Fixtures: A (owner, manager, receptionist, staff), B (other owner), C (rate limit), products.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_id uuid; v_biz uuid; v_m uuid;
begin
  for r in select * from (values ('owner'), ('mgr'), ('recep'), ('staff'), ('ownerb'), ('ownerc')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bs54.' || r.k || '@example.com',
            extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
  for r in select * from (values ('owner', 'biza'), ('ownerb', 'bizb'), ('ownerc', 'bizc')) as x(u, b) loop
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(r.u), 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_biz := public.create_business_with_owner('BS54 ' || r.b, 'bs54-' || r.b || '-check', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
    reset role;
    insert into ids values (r.b, v_biz);
  end loop;
  perform set_config('request.jwt.claims', '', true);
  for r in select * from (values ('mgr', 'manager'), ('recep', 'receptionist'), ('staff', 'staff')) as x(u, role) loop
    insert into public.business_members (business_id, user_id, status, joined_at)
    values (pg_temp.id('biza'), pg_temp.id(r.u), 'active', now()) returning id into v_m;
    insert into public.member_role_assignments (member_id, role_id, branch_id)
    values (v_m, (select id from public.roles where business_id is null and key = r.role), null);
  end loop;
end $$;
insert into public.billing_products (polar_product_id, kind, key, interval) values
  ('bs54-solo-m', 'plan', 'solo', 'month'), ('bs54-team-m', 'plan', 'team', 'month'), ('bs54-team-y', 'plan', 'team', 'year'),
  ('bs54-biz-m', 'plan', 'business', 'month'), ('bs54-biz-y', 'plan', 'business', 'year'), ('bs54-inv-m', 'addon', 'inventory', 'month'), ('bs54-inv-y', 'addon', 'inventory', 'year'),
  ('bs54-roles-m', 'addon', 'custom_roles', 'month');

-- ---------------------------------------------------------------------------
-- 1. Who may ask
-- ---------------------------------------------------------------------------
insert into snap values ('a0', pg_temp.bstate('biza')), ('a0n', pg_temp.audits('biza'));
select pg_temp.chk('anon: no EXECUTE',
  pg_temp.as_anon(format($q$select public.billing_prepare(%L, 'portal', '{}')$q$, pg_temp.id('biza'))) ->> 'state', '42501');
select pg_temp.chk('manager / receptionist / staff / other owner / unknown business: forbidden',
  pg_temp.code('mgr', 'biza', 'checkout', '{"kind":"plan","key":"team","interval":"month"}') || ',' ||
  pg_temp.code('recep', 'biza', 'checkout', '{"kind":"plan","key":"team","interval":"month"}') || ',' ||
  pg_temp.code('staff', 'biza', 'portal') || ',' ||
  pg_temp.code('ownerb', 'biza', 'checkout', '{"kind":"plan","key":"team","interval":"month"}') || ',' ||
  coalesce(pg_temp.as_('owner', format($q$select public.billing_prepare(%L, 'portal', '{}')$q$, gen_random_uuid())) ->> 'code', '?'),
  'forbidden,forbidden,forbidden,forbidden,forbidden');
select pg_temp.chk('owner: bad action / bad args',
  pg_temp.code('owner', 'biza', 'refund') || ',' || pg_temp.code('owner', 'biza', 'checkout', '[]') || ',' ||
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"plan","key":"team","interval":"week"}') || ',' ||
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"seat","key":"team","interval":"month"}') || ',' ||
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"plan","key":"gold","interval":"month"}'),
  'invalid_input,invalid_input,invalid_input,invalid_input,invalid_input');
select pg_temp.chk('...billing state of A unchanged', pg_temp.bstate('biza'), (select v from snap where k = 'a0'));
select pg_temp.chk('...and no audit row from a refusal', pg_temp.audits('biza'), (select v from snap where k = 'a0n'));

-- ---------------------------------------------------------------------------
-- 2. Rate limit (own business, a tiny limit)
-- ---------------------------------------------------------------------------
update public.rate_limit_rules set max_attempts = 2 where endpoint = 'billing_action' and scope = 'biz';
select pg_temp.code('ownerc', 'bizc', 'portal');
select pg_temp.code('ownerc', 'bizc', 'portal');
select pg_temp.chk('third action within the hour: rate_limited', pg_temp.code('ownerc', 'bizc', 'portal'), 'rate_limited');
update public.rate_limit_rules set max_attempts = 100000 where endpoint = 'billing_action';

-- ---------------------------------------------------------------------------
-- 3. Checkout of a plan
-- ---------------------------------------------------------------------------
insert into out values ('co', pg_temp.prep('owner', 'biza', 'checkout', '{"kind":"plan","key":"team","interval":"month"}'));
select pg_temp.chk('checkout Team monthly during the trial: ok, the product, the DB price, no seats',
  (select concat_ws('|', v ->> 'ok', v ->> 'product_id', v ->> 'price_minor', v ->> 'currency', coalesce(v ->> 'seats', '-'),
     v ->> 'customer_email', (v ->> 'business_id' = pg_temp.id('biza')::text)::text) from out where k = 'co'),
  'true|bs54-team-m|' || (select price_monthly_minor from public.plans where key = 'team') || '|' || (select currency from public.plans where key = 'team')
  || '|-|bs54.owner@example.com|true');
select pg_temp.chk('...keeps the trial days left (14)', (select v ->> 'trial_days' from out where k = 'co'), '14');
select pg_temp.chk('...audited checkout_started, billing state untouched',
  (select count(*)::text from public.audit_logs where business_id = pg_temp.id('biza') and action = 'billing.checkout_started') || '|' ||
  (pg_temp.bstate('biza') = (select v from snap where k = 'a0'))::text, '1|true');
select pg_temp.chk('checkout Business: seats = locations (1), per-seat price',
  (select (r ->> 'seats') || '|' || (r ->> 'price_minor') from (select pg_temp.prep('owner', 'biza', 'checkout', '{"kind":"plan","key":"business","interval":"month"}') r) x),
  '1|' || (select price_monthly_minor from public.plans where key = 'business'));
select pg_temp.chk('checkout of an interval with no Polar product: not_available',
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"plan","key":"solo","interval":"year"}'), 'not_available');
update public.billing_products set active = false where polar_product_id = 'bs54-solo-m';
select pg_temp.chk('...or a deactivated product: not_available',
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"plan","key":"solo","interval":"month"}'), 'not_available');
update public.billing_products set active = true where polar_product_id = 'bs54-solo-m';
-- Over Solo's limits: a second active staff in the location.
do $$
declare v_sp uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  for i in 1..2 loop
    insert into public.staff_profiles (business_id, display_name) values (pg_temp.id('biza'), 'BS54 Staff ' || i) returning id into v_sp;
    insert into public.staff_branches (staff_id, branch_id, business_id) select v_sp, id, business_id from public.branches where business_id = pg_temp.id('biza');
  end loop;
end $$;
insert into out values ('over', pg_temp.prep('owner', 'biza', 'checkout', '{"kind":"plan","key":"solo","interval":"month"}'));
select pg_temp.chk('checkout Solo with 2 staff: over_limit with the details',
  (select (v ->> 'code') || '|' || (v -> 'staff_over_cap' -> 0 ->> 'active_staff') || '/' || (v -> 'staff_over_cap' -> 0 ->> 'cap') from out where k = 'over'), 'over_limit|2/1');
select pg_temp.chk('add-on checkout without a Polar plan: plan_required',
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"addon","key":"inventory","interval":"month"}'), 'plan_required');
select pg_temp.chk('portal before any Polar subscription: no_billing_account', pg_temp.code('owner', 'biza', 'portal'), 'no_billing_account');
select pg_temp.chk('plan actions before any subscription: no_subscription',
  pg_temp.code('owner', 'biza', 'cancel') || ',' || pg_temp.code('owner', 'biza', 'change_plan', '{"key":"solo","interval":"month"}') || ',' ||
  pg_temp.code('owner', 'biza', 'change_seats', '{"seats":2}') || ',' || pg_temp.code('owner', 'biza', 'remove_addon', '{"key":"inventory"}'),
  'no_subscription,no_subscription,no_subscription,no_subscription');
select pg_temp.chk('...billing state of A still unchanged', pg_temp.bstate('biza'), (select v from snap where k = 'a0'));

-- ---------------------------------------------------------------------------
-- 4. With a live Team monthly plan
-- ---------------------------------------------------------------------------
select pg_temp.chk('Team monthly subscription applied', pg_temp.apply(pg_temp.snapshot('s54-plan', 'biza', 'bs54-team-m', 'active')), 'applied');
insert into snap values ('a1', pg_temp.bstate('biza'));
select pg_temp.chk('a second plan checkout: already_subscribed',
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"plan","key":"business","interval":"month"}'), 'already_subscribed');
select pg_temp.chk('portal: ok now', pg_temp.code('owner', 'biza', 'portal'), 'ok');
insert into out values ('addon', pg_temp.prep('owner', 'biza', 'checkout', '{"kind":"addon","key":"inventory","interval":"month"}'));
select pg_temp.chk('add-on checkout: ok, its product and price, no trial (plan not trialing)',
  (select concat_ws('|', v ->> 'ok', v ->> 'product_id', v ->> 'price_minor', coalesce(v ->> 'trial_days', '-')) from out where k = 'addon'),
  'true|bs54-inv-m|' || (select price_monthly_minor from public.addons where key = 'inventory') || '|-');
select pg_temp.chk('add-on with another interval than the plan: interval_mismatch',
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"addon","key":"inventory","interval":"year"}'), 'interval_mismatch');
select pg_temp.chk('custom roles on Team: allowed', pg_temp.code('owner', 'biza', 'checkout', '{"kind":"addon","key":"custom_roles","interval":"month"}'), 'ok');
select pg_temp.chk('change_seats on Team: not_per_location', pg_temp.code('owner', 'biza', 'change_seats', '{"seats":2}'), 'not_per_location');
select pg_temp.chk('change to the same plan + interval: no_change',
  pg_temp.code('owner', 'biza', 'change_plan', '{"key":"team","interval":"month"}'), 'no_change');
select pg_temp.chk('downgrade to Solo over its limits: over_limit',
  pg_temp.code('owner', 'biza', 'change_plan', '{"key":"solo","interval":"month"}'), 'over_limit');
insert into out values ('up', pg_temp.prep('owner', 'biza', 'change_plan', '{"key":"business","interval":"month"}'));
select pg_temp.chk('upgrade to Business: invoice now, seats = locations',
  (select concat_ws('|', v ->> 'ok', v ->> 'subscription_id', v ->> 'product_id', v ->> 'seats', v ->> 'proration') from out where k = 'up'),
  'true|s54-plan|bs54-biz-m|1|invoice');
select pg_temp.chk('monthly -> yearly Team (cheaper per month): prorate',
  (pg_temp.prep('owner', 'biza', 'change_plan', '{"key":"team","interval":"year"}')) ->> 'proration', 'prorate');
select pg_temp.chk('cancel: ok, cancel_at_period_end true',
  (select (r ->> 'ok') || '|' || (r ->> 'cancel_at_period_end') from (select pg_temp.prep('owner', 'biza', 'cancel') r) x), 'true|true');
select pg_temp.chk('uncancel while not cancelled: no_change', pg_temp.code('owner', 'biza', 'uncancel'), 'no_change');
select pg_temp.chk('...billing state of A unchanged by all of these', pg_temp.bstate('biza'), (select v from snap where k = 'a1'));

-- The staff go, so Solo fits again.
update public.staff_profiles set is_active = false where business_id = pg_temp.id('biza');
select pg_temp.chk('downgrade to Solo within limits: prorate',
  (pg_temp.prep('owner', 'biza', 'change_plan', '{"key":"solo","interval":"month"}')) ->> 'proration', 'prorate');

-- Cancel scheduled, past due.
select pg_temp.apply(pg_temp.snapshot('s54-plan', 'biza', 'bs54-team-m', 'active', jsonb_build_object('cancel_at_period_end', true, 'modified_at', now() - interval '50 minutes')));
select pg_temp.chk('cancel scheduled: plan change / add-on refused, uncancel ok',
  pg_temp.code('owner', 'biza', 'change_plan', '{"key":"business","interval":"month"}') || ',' ||
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"addon","key":"inventory","interval":"month"}') || ',' ||
  pg_temp.code('owner', 'biza', 'uncancel'),
  'cancel_scheduled,cancel_scheduled,ok');
select pg_temp.apply(pg_temp.snapshot('s54-plan', 'biza', 'bs54-team-m', 'past_due', jsonb_build_object('past_due_at', now(), 'modified_at', now() - interval '40 minutes')));
select pg_temp.chk('past due: plan change refused until the card is fixed',
  pg_temp.code('owner', 'biza', 'change_plan', '{"key":"business","interval":"month"}'), 'payment_overdue');
select pg_temp.apply(pg_temp.snapshot('s54-plan', 'biza', 'bs54-team-m', 'active', jsonb_build_object('modified_at', now() - interval '30 minutes')));

-- ---------------------------------------------------------------------------
-- 5. Add-on actions
-- ---------------------------------------------------------------------------
select pg_temp.chk('add-on subscription applied', pg_temp.apply(pg_temp.snapshot('s54-inv', 'biza', 'bs54-inv-m', 'active')), 'applied');
select pg_temp.chk('a second inventory checkout: already_subscribed',
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"addon","key":"inventory","interval":"month"}'), 'already_subscribed');
select pg_temp.chk('keep_addon while not removed: no_change', pg_temp.code('owner', 'biza', 'keep_addon', '{"key":"inventory"}'), 'no_change');
select pg_temp.chk('remove_addon: ok, at period end',
  (select (r ->> 'subscription_id') || '|' || (r ->> 'cancel_at_period_end') from (select pg_temp.prep('owner', 'biza', 'remove_addon', '{"key":"inventory"}') r) x),
  's54-inv|true');
select pg_temp.chk('remove_addon of an add-on without a subscription: no_subscription',
  pg_temp.code('owner', 'biza', 'remove_addon', '{"key":"packages"}'), 'no_subscription');
select pg_temp.chk('remove_addon of an unknown add-on: invalid_input', pg_temp.code('owner', 'biza', 'remove_addon', '{"key":"waitlist"}'), 'invalid_input');
select pg_temp.apply(pg_temp.snapshot('s54-inv', 'biza', 'bs54-inv-m', 'active', jsonb_build_object('cancel_at_period_end', true, 'modified_at', now())));
select pg_temp.chk('keep_addon after removing it: ok', pg_temp.code('owner', 'biza', 'keep_addon', '{"key":"inventory"}'), 'ok');

-- ---------------------------------------------------------------------------
-- 6. Business plan: seats
-- ---------------------------------------------------------------------------
select pg_temp.apply(pg_temp.snapshot('s54-plan', 'biza', 'bs54-biz-m', 'active', jsonb_build_object('seats', 2, 'modified_at', now() - interval '20 minutes')));
select pg_temp.chk('Business addon checkout of custom roles: addon_included',
  pg_temp.code('owner', 'biza', 'checkout', '{"kind":"addon","key":"custom_roles","interval":"month"}'), 'addon_included');
select pg_temp.chk('seats: not a number / below locations / above 1000 / same',
  pg_temp.code('owner', 'biza', 'change_seats', '{"seats":"3"}') || ',' || pg_temp.code('owner', 'biza', 'change_seats', '{"seats":0}') || ',' ||
  pg_temp.code('owner', 'biza', 'change_seats', '{"seats":1001}') || ',' || pg_temp.code('owner', 'biza', 'change_seats', '{"seats":2}'),
  'invalid_input,invalid_seats,invalid_seats,no_change');
select pg_temp.chk('seats up: invoice; down: prorate',
  (pg_temp.prep('owner', 'biza', 'change_seats', '{"seats":5}') ->> 'proration') || ',' || (pg_temp.prep('owner', 'biza', 'change_seats', '{"seats":1}') ->> 'proration'),
  'invoice,prorate');
select pg_temp.chk('Business -> Team keeps nothing per seat; Team monthly is cheaper than 2 seats: prorate',
  pg_temp.prep('owner', 'biza', 'change_plan', '{"key":"team","interval":"month"}') ->> 'proration', 'prorate');
select pg_temp.chk('Business monthly -> yearly keeps the paid seats (2)',
  pg_temp.prep('owner', 'biza', 'change_plan', '{"key":"business","interval":"year"}') ->> 'seats', '2');

-- ---------------------------------------------------------------------------
-- 7. Suspended: only the portal (invoices, card)
-- ---------------------------------------------------------------------------
update public.business_subscriptions set status = 'suspended' where business_id = pg_temp.id('biza');
select pg_temp.chk('suspended: actions refused, portal allowed',
  pg_temp.code('owner', 'biza', 'cancel') || ',' || pg_temp.code('owner', 'biza', 'checkout', '{"kind":"addon","key":"packages","interval":"month"}') || ',' ||
  pg_temp.code('owner', 'biza', 'portal'), 'suspended,suspended,ok');

-- ---------------------------------------------------------------------------
-- 8. Reconcile support, cleanup, cron, grants
-- ---------------------------------------------------------------------------
select pg_temp.chk('reconcile targets include A''s live subscriptions and A',
  (select (t -> 'subscriptions' @> '["s54-plan", "s54-inv"]'::jsonb)::text || '|' || (t -> 'businesses' @> to_jsonb(array[pg_temp.id('biza')]))::text
   from (select public.billing_reconcile_targets() t) x), 'true|true');
insert into public.billing_webhook_events (webhook_id, event_type, received_at) values
  ('bs54-old', 'subscription.updated', now() - interval '91 days'), ('bs54-new', 'subscription.updated', now() - interval '89 days');
select pg_temp.chk('cleanup: one row older than 90 days', public.billing_cleanup_events()::text, '1');
select pg_temp.chk('...only the newer one is left',
  (select string_agg(webhook_id, ',') from public.billing_webhook_events where webhook_id like 'bs54-%'), 'bs54-new');
select pg_temp.chk('the daily reconcile cron job exists',
  (select schedule || '|' || active from cron.job where jobname = 'billing-reconcile'), '17 3 * * *|true');
select pg_temp.chk('grants: prepare for authenticated only; the rest service_role / internal',
  concat_ws(',',
    has_function_privilege('authenticated', 'public.billing_prepare(uuid,text,jsonb)', 'EXECUTE'),
    has_function_privilege('anon', 'public.billing_prepare(uuid,text,jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.billing_reconcile_targets()', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.billing_cleanup_events()', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.invoke_billing_reconcile()', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.billing_primary(uuid,text,text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.billing_reconcile_targets()', 'EXECUTE')),
  't,f,f,f,f,f,t');

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total,
  coalesce(string_agg(n || ' ' || name || ': ' || detail, E'\n' order by n) filter (where not pass), '') as failures
from res;

rollback;
