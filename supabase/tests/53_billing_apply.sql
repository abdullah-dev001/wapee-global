-- Polar billing, part 2 (migration 20261027110000): billing_apply_subscription, billing_derive,
-- billing_followups, billing_mark_followup, webhook event dedupe and refund audit.
--
--   supabase db query --linked -f supabase/tests/53_billing_apply.sql
--
-- Plain SQL, own fixtures, ROLLS BACK. Every refusal asserts the STORED state (subscription
-- rows, the business's plan/status/period, add-on rows, audit count) is exactly as it was
-- (CLAUDE.md section 5). Calls and the reads that check them are separate statements. now() is
-- fixed for the whole transaction, so expected times are computed from it.
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
create or replace function pg_temp.q(p_sql text) returns text language plpgsql as $$
declare v text;
begin execute p_sql into v; return v; end $$;
create or replace function pg_temp.as_auth(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('owner'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into r;
  exception when others then reset role; return jsonb_build_object('raised', true, 'state', sqlstate); end;
  reset role;
  return r;
end $$;

-- A snapshot as the Edge Function builds it. p_over overrides any field.
create or replace function pg_temp.snapshot(p_id text, p_biz text, p_product text, p_status text, p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'customer_id', 'cus_' || p_biz, 'external_customer_id', pg_temp.id(p_biz),
    'metadata_business_id', pg_temp.id(p_biz), 'product_id', p_product, 'status', p_status,
    'recurring_interval', (select interval from public.billing_products where polar_product_id = p_product),
    'seats', null, 'cancel_at_period_end', false,
    'current_period_start', now() - interval '1 day', 'current_period_end', now() + interval '29 days',
    'ended_at', null, 'past_due_at', null,
    'created_at', now() - interval '1 day', 'modified_at', now() - interval '1 hour') || p_over
$$;
create or replace function pg_temp.apply(p_snapshot jsonb) returns jsonb language sql as $$
  select public.billing_apply_subscription(p_snapshot)
$$;
-- Everything a refusal must leave untouched, for one business.
create or replace function pg_temp.state(p_biz text) returns text language sql as $$
  select concat_ws(' # ',
    (select plan || '|' || status || '|' || billing_source || '|' || coalesce(current_period_end::text, '-') || '|' || coalesce(polar_detached_at::text, '-')
     from public.business_subscriptions where business_id = pg_temp.id(p_biz)),
    (select coalesce(string_agg(polar_subscription_id || '|' || polar_status || '|' || live || '|' || coalesce(access_until::text, '-')
       || '|' || cancel_at_period_end || '|' || coalesce(seats::text, '-') || '|' || polar_modified_at || '|' || coalesce(followup, '-'),
       ';' order by polar_subscription_id), 'none')
     from public.billing_subscriptions where business_id = pg_temp.id(p_biz)),
    (select coalesce(string_agg(addon_key || '|' || enabled || '|' || source || '|' || coalesce(access_until::text, '-'), ';' order by addon_key), 'none')
     from public.business_addons where business_id = pg_temp.id(p_biz)),
    (select count(*)::text from public.audit_logs where business_id = pg_temp.id(p_biz)))
$$;
create or replace function pg_temp.plan(p_biz text) returns text language sql as $$
  select plan || '|' || status || '|' || billing_source || '|' || coalesce(current_period_end::text, '-')
  from public.business_subscriptions where business_id = pg_temp.id(p_biz)
$$;
create or replace function pg_temp.addon(p_biz text, p_key text) returns text language sql as $$
  select enabled || '|' || source || '|' || coalesce(access_until::text, '-')
  from public.business_addons where business_id = pg_temp.id(p_biz) and addon_key = p_key
$$;
create or replace function pg_temp.fu(p_biz text) returns text language sql as $$
  select coalesce(string_agg((e ->> 'subscription_id') || ':' || (e ->> 'action') || ':' || (e ->> 'reason') || ':' || (e ->> 'refund'),
                             ',' order by e ->> 'subscription_id'), 'none')
  from jsonb_array_elements(public.billing_followups(pg_temp.id(p_biz))) e
$$;

do $$
declare v_schema text;
begin
  select nspname into v_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', v_schema);
  execute format('grant select on %I.ids to authenticated, anon', v_schema);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: businesses A (trialing), B, C; products.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_id uuid; v_biz uuid;
begin
  for r in select * from (values ('owner'), ('ownerb'), ('ownerc')) as x(k) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bs53.' || r.k || '@example.com',
            extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb);
    insert into ids values (r.k, v_id);
  end loop;
  for r in select * from (values ('owner', 'biza'), ('ownerb', 'bizb'), ('ownerc', 'bizc')) as x(u, b) loop
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(r.u), 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_biz := public.create_business_with_owner('BS53 ' || r.b, 'bs53-' || r.b || '-check', 'GB', 'GBP', 'Europe/London', 'en', null, 'Main');
    reset role;
    insert into ids values (r.b, v_biz);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into public.billing_products (polar_product_id, kind, key, interval) values
  ('bs53-solo-m', 'plan', 'solo', 'month'), ('bs53-team-m', 'plan', 'team', 'month'), ('bs53-team-y', 'plan', 'team', 'year'),
  ('bs53-biz-m', 'plan', 'business', 'month'), ('bs53-inv-m', 'addon', 'inventory', 'month'),
  ('bs53-roles-m', 'addon', 'custom_roles', 'month'), ('bs53-pkg-m', 'addon', 'packages', 'month');

-- ---------------------------------------------------------------------------
-- 1. Grants: service_role only
-- ---------------------------------------------------------------------------
select pg_temp.chk('authenticated cannot run billing_apply_subscription',
  pg_temp.as_auth($q$select public.billing_apply_subscription('{}'::jsonb)$q$) ->> 'state', '42501');
select pg_temp.chk('no API role can run the internals; service_role runs the entry points',
  (select string_agg(f || ':' || has_function_privilege('authenticated', f, 'EXECUTE') || '/' || has_function_privilege('anon', f, 'EXECUTE')
     || '/' || has_function_privilege('service_role', f, 'EXECUTE'), ',' order by f)
   from unnest(array['public.billing_apply_subscription(jsonb)', 'public.billing_followups(uuid)', 'public.billing_mark_followup(text,text)',
     'public.billing_begin_event(text,text,text)', 'public.billing_finish_event(text,text,text,uuid)',
     'public.billing_record_refund(uuid,text,text,bigint,text,text)']) f),
  'public.billing_apply_subscription(jsonb):false/false/true,public.billing_begin_event(text,text,text):false/false/true,public.billing_finish_event(text,text,text,uuid):false/false/true,public.billing_followups(uuid):false/false/true,public.billing_mark_followup(text,text):false/false/true,public.billing_record_refund(uuid,text,text,bigint,text,text):false/false/true');
select pg_temp.chk('billing_derive / billing_grace are not callable through the API',
  (has_function_privilege('authenticated', 'public.billing_derive(uuid)', 'EXECUTE') or has_function_privilege('anon', 'public.billing_derive(uuid)', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.billing_grace()', 'EXECUTE'))::text, 'false');

-- ---------------------------------------------------------------------------
-- 2. Refusals: nothing stored, nothing changed
-- ---------------------------------------------------------------------------
insert into snap values ('a0', pg_temp.state('biza'));
insert into out values
  ('null', pg_temp.apply(null)),
  ('array', pg_temp.apply('[]'::jsonb)),
  ('no_id', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active') - 'id')),
  ('bad_status', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'live'))),
  ('no_business', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active', '{"external_customer_id": null, "metadata_business_id": null}'))),
  ('ext_vs_meta', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active', jsonb_build_object('metadata_business_id', pg_temp.id('bizb'))))),
  ('bad_uuid', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active', '{"external_customer_id": "nope", "metadata_business_id": null}'))),
  ('bad_time', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active', '{"current_period_end": "tomorrow-ish"}'))),
  ('bad_bool', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active', '{"cancel_at_period_end": "yes"}'))),
  ('no_end', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active', '{"current_period_end": null}'))),
  ('no_created', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active', '{"created_at": null}'))),
  ('unknown_product', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-nope', 'active', '{"recurring_interval": "month"}'))),
  ('interval', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active', '{"recurring_interval": "year"}'))),
  ('no_seats', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-biz-m', 'active'))),
  ('zero_seats', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-biz-m', 'active', '{"seats": 0}'))),
  ('unknown_biz', pg_temp.apply(pg_temp.snapshot('s1', 'biza', 'bs53-team-m', 'active',
     jsonb_build_object('external_customer_id', gen_random_uuid(), 'metadata_business_id', null))));
select pg_temp.chk('refusal codes',
  (select string_agg(k || '=' || (v ->> 'code'), ',' order by k) from out),
  'array=invalid_snapshot,bad_bool=invalid_snapshot,bad_status=invalid_snapshot,bad_time=invalid_snapshot,bad_uuid=invalid_snapshot,ext_vs_meta=invalid_snapshot,interval=interval_mismatch,no_business=invalid_snapshot,no_created=invalid_snapshot,no_end=invalid_snapshot,no_id=invalid_snapshot,no_seats=invalid_snapshot,null=invalid_snapshot,unknown_biz=not_found,unknown_product=unknown_product,zero_seats=invalid_snapshot');
select pg_temp.chk('...every refusal is ok:false', (select bool_and(v ->> 'ok' = 'false')::text from out), 'true');
select pg_temp.chk('...business A exactly as before', pg_temp.state('biza'), (select v from snap where k = 'a0'));
select pg_temp.chk('...no billing rows anywhere for these', (select count(*)::text from public.billing_subscriptions where polar_subscription_id = 's1'), '0');
-- A soft-deleted business is not found.
update public.businesses set deleted_at = now() where id = pg_temp.id('bizc');
insert into snap values ('c0', pg_temp.state('bizc'));
select pg_temp.chk('deleted business: not_found',
  pg_temp.apply(pg_temp.snapshot('sc', 'bizc', 'bs53-team-m', 'active')) ->> 'code', 'not_found');
select pg_temp.chk('...business C unchanged', pg_temp.state('bizc'), (select v from snap where k = 'c0'));

-- ---------------------------------------------------------------------------
-- 3. First subscription: a trialing business pays for Team monthly
-- ---------------------------------------------------------------------------
insert into out values ('first', pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-m', 'active')));
select pg_temp.chk('first: applied', (select v ->> 'code' from out where k = 'first'), 'applied');
select pg_temp.chk('...plan team, active, Polar, access = period end + 7 days',
  pg_temp.plan('biza'), 'team|active|polar|' || (now() + interval '36 days')::text);
select pg_temp.chk('...mirrored to businesses (the lock rule reads it)',
  (select plan || '|' || status || '|' || (current_period_end = now() + interval '36 days')::text from public.businesses where id = pg_temp.id('biza')), 'team|active|true');
select pg_temp.chk('...business is active', public.business_is_active(pg_temp.id('biza'))::text, 'true');
select pg_temp.chk('...stored subscription row',
  (select kind || '|' || key || '|' || interval || '|' || polar_status || '|' || live || '|' || coalesce(seats::text, '-') || '|' || coalesce(past_due_since::text, '-')
   from public.billing_subscriptions where polar_subscription_id = 'sa1'), 'plan|team|month|active|true|-|-');
select pg_temp.chk('...audited: subscription + plan sync',
  (select string_agg(action, ',' order by id) from public.audit_logs where business_id = pg_temp.id('biza') and action like 'billing.%'),
  'billing.subscription_updated,billing.plan_synced');

-- ---------------------------------------------------------------------------
-- 4. Stale and out-of-order snapshots change nothing
-- ---------------------------------------------------------------------------
insert into snap values ('a1', pg_temp.state('biza'));
select pg_temp.chk('same snapshot again: stale',
  pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-m', 'active')) ->> 'code', 'stale');
select pg_temp.chk('older snapshot (past_due, earlier modified_at): stale',
  pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-m', 'past_due', jsonb_build_object('modified_at', now() - interval '2 hours'))) ->> 'code', 'stale');
select pg_temp.chk('...state exactly as before', pg_temp.state('biza'), (select v from snap where k = 'a1'));
select pg_temp.chk('a subscription id cannot move to another business',
  pg_temp.apply(pg_temp.snapshot('sa1', 'bizb', 'bs53-team-m', 'active', jsonb_build_object('modified_at', now()))) ->> 'code', 'business_mismatch');
select pg_temp.chk('...nor become an add-on',
  pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-inv-m', 'active', jsonb_build_object('modified_at', now()))) ->> 'code', 'business_mismatch');
select pg_temp.chk('...A unchanged', pg_temp.state('biza'), (select v from snap where k = 'a1'));

-- ---------------------------------------------------------------------------
-- 5. Cancel at period end, past due, recovery, ended
-- ---------------------------------------------------------------------------
select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-m', 'active',
  jsonb_build_object('cancel_at_period_end', true, 'modified_at', now() - interval '50 minutes')));
select pg_temp.chk('cancel at period end: access = period end (no grace)',
  pg_temp.plan('biza'), 'team|active|polar|' || (now() + interval '29 days')::text);

select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-m', 'past_due',
  jsonb_build_object('past_due_at', now() - interval '2 days', 'modified_at', now() - interval '40 minutes')));
select pg_temp.chk('past due: access = 7 days after it went past due',
  pg_temp.plan('biza'), 'team|active|polar|' || (now() + interval '5 days')::text);
select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-m', 'past_due',
  jsonb_build_object('past_due_at', now(), 'modified_at', now() - interval '35 minutes')));
select pg_temp.chk('...a later past-due snapshot keeps the FIRST past-due time',
  (select past_due_since::text from public.billing_subscriptions where polar_subscription_id = 'sa1'), (now() - interval '2 days')::text);
-- Eight days pass without payment (simulated on the stored row), then Polar sends another update.
update public.billing_subscriptions set past_due_since = now() - interval '8 days' where polar_subscription_id = 'sa1';
select pg_temp.chk('grace over after Polar rolled the period: still applies (access end before period start)',
  pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-m', 'past_due',
    jsonb_build_object('past_due_at', now() - interval '8 days', 'modified_at', now() - interval '34 minutes'))) ->> 'code', 'applied');
select pg_temp.chk('...grace over: still "active" but locked by the period end rule',
  (select status || '|' || public.business_is_active(pg_temp.id('biza'))::text from public.business_subscriptions where business_id = pg_temp.id('biza')),
  'active|false');

select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-m', 'active', jsonb_build_object('modified_at', now() - interval '30 minutes')));
select pg_temp.chk('paid again: past-due time cleared, access = period end + 7 days',
  (select coalesce(past_due_since::text, '-') from public.billing_subscriptions where polar_subscription_id = 'sa1') || '|' || pg_temp.plan('biza'),
  '-|team|active|polar|' || (now() + interval '36 days')::text);

-- ---------------------------------------------------------------------------
-- 6. Suspended stays suspended
-- ---------------------------------------------------------------------------
update public.business_subscriptions set status = 'suspended' where business_id = pg_temp.id('biza');
select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-y', 'active',
  jsonb_build_object('recurring_interval', 'year', 'modified_at', now() - interval '25 minutes', 'current_period_end', now() + interval '360 days')));
select pg_temp.chk('suspended business: plan follows Polar, status stays suspended',
  pg_temp.plan('biza'), 'team|suspended|polar|' || (now() + interval '367 days')::text);
update public.business_subscriptions set status = 'active' where business_id = pg_temp.id('biza');

-- ---------------------------------------------------------------------------
-- 7. Add-ons
-- ---------------------------------------------------------------------------
select pg_temp.chk('add-on inventory: applied',
  pg_temp.apply(pg_temp.snapshot('sa-inv', 'biza', 'bs53-inv-m', 'active')) ->> 'code', 'applied');
select pg_temp.chk('...enabled, Polar, access = period end + 7 days',
  pg_temp.addon('biza', 'inventory'), 'true|polar|' || (now() + interval '36 days')::text);
select pg_temp.chk('...the feature is on', public.business_has_feature(pg_temp.id('biza'), 'inventory')::text, 'true');
select pg_temp.apply(pg_temp.snapshot('sa-inv', 'biza', 'bs53-inv-m', 'canceled',
  jsonb_build_object('ended_at', now() - interval '1 minute', 'modified_at', now())));
select pg_temp.chk('add-on ended: disabled', pg_temp.addon('biza', 'inventory'), 'false|polar|' || (now() - interval '1 minute')::text);
select pg_temp.chk('...the feature is off', public.business_has_feature(pg_temp.id('biza'), 'inventory')::text, 'false');
-- A super admin detached packages; an older Polar subscription for it is stored but does not drive it.
insert into public.business_addons (business_id, addon_key, enabled, source, polar_detached_at)
values (pg_temp.id('biza'), 'packages', false, 'manual', now() - interval '1 hour');
select pg_temp.apply(pg_temp.snapshot('sa-pkg-old', 'biza', 'bs53-pkg-m', 'active', jsonb_build_object('created_at', now() - interval '2 hours')));
select pg_temp.chk('detached add-on: an older subscription does not re-enable it', pg_temp.addon('biza', 'packages'), 'false|manual|-');
select pg_temp.apply(pg_temp.snapshot('sa-pkg-new', 'biza', 'bs53-pkg-m', 'active', jsonb_build_object('created_at', now() - interval '10 minutes')));
select pg_temp.chk('...a subscription started after the detach attaches it again',
  pg_temp.addon('biza', 'packages'), 'true|polar|' || (now() + interval '36 days')::text);

-- ---------------------------------------------------------------------------
-- 8. Manual businesses and detached plans
-- ---------------------------------------------------------------------------
update public.business_subscriptions set plan = 'solo', status = 'active', billing_source = 'manual', polar_detached_at = now() - interval '1 hour',
  current_period_end = null where business_id = pg_temp.id('bizb');
insert into snap values ('b0', pg_temp.plan('bizb'));
select pg_temp.chk('detached plan: an older live subscription is stored',
  pg_temp.apply(pg_temp.snapshot('sb-old', 'bizb', 'bs53-team-m', 'active', jsonb_build_object('created_at', now() - interval '2 hours'))) ->> 'code', 'applied');
select pg_temp.chk('...but the manual plan is untouched', pg_temp.plan('bizb'), (select v from snap where k = 'b0'));
select pg_temp.chk('an ENDED subscription never takes over a manual plan',
  (pg_temp.apply(pg_temp.snapshot('sb-ended', 'bizb', 'bs53-team-m', 'canceled',
     jsonb_build_object('created_at', now() - interval '5 minutes', 'ended_at', now() - interval '1 minute'))) ->> 'code'), 'applied');
select pg_temp.chk('...manual plan still untouched', pg_temp.plan('bizb'), (select v from snap where k = 'b0'));
select pg_temp.apply(pg_temp.snapshot('sb-biz', 'bizb', 'bs53-biz-m', 'active',
  jsonb_build_object('created_at', now() - interval '4 minutes', 'seats', 3)));
select pg_temp.chk('a new live subscription after the detach attaches: Business, 3 seats',
  pg_temp.plan('bizb') || '|' || (public.business_plan_limits(pg_temp.id('bizb')) ->> 'max_branches'),
  'business|active|polar|' || (now() + interval '36 days')::text || '|3');

-- ---------------------------------------------------------------------------
-- 9. Follow-ups: add-ons follow the plan, duplicates are revoked + refunded
-- ---------------------------------------------------------------------------
-- A: plan sa1 (team, yearly now), add-on packages live (sa-pkg-new), and a stale detached one (sa-pkg-old).
select pg_temp.chk('nothing to do while the plan is live and not cancelled', pg_temp.fu('biza'), 'none');
select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-y', 'active',
  jsonb_build_object('recurring_interval', 'year', 'cancel_at_period_end', true, 'modified_at', now() - interval '20 minutes',
                     'current_period_end', now() + interval '360 days')));
select pg_temp.chk('plan cancelled at period end: cancel its add-ons too', pg_temp.fu('biza'), 'sa-pkg-new:cancel:plan_cancel:false');
select pg_temp.chk('mark the follow-up', public.billing_mark_followup('sa-pkg-new', 'plan_cancel') ->> 'ok', 'true');
select pg_temp.apply(pg_temp.snapshot('sa-pkg-new', 'biza', 'bs53-pkg-m', 'active',
  jsonb_build_object('created_at', now() - interval '10 minutes', 'cancel_at_period_end', true, 'modified_at', now() - interval '5 minutes')));
select pg_temp.chk('...done: nothing left to do', pg_temp.fu('biza'), 'none');
select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-team-y', 'active',
  jsonb_build_object('recurring_interval', 'year', 'modified_at', now() - interval '15 minutes', 'current_period_end', now() + interval '360 days')));
select pg_temp.chk('plan uncancelled: uncancel the add-ons WE cancelled', pg_temp.fu('biza'), 'sa-pkg-new:uncancel:plan_cancel:false');
update public.billing_subscriptions set followup = null where polar_subscription_id = 'sa-pkg-new';
select pg_temp.chk('an add-on the OWNER cancelled is not uncancelled', pg_temp.fu('biza'), 'none');

select pg_temp.apply(pg_temp.snapshot('sa-roles', 'biza', 'bs53-roles-m', 'active', jsonb_build_object('created_at', now() - interval '9 minutes')));
select pg_temp.chk('custom roles add-on on Team: allowed', pg_temp.fu('biza'), 'none');
select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-solo-m', 'active', jsonb_build_object('modified_at', now() - interval '10 minutes')));
select pg_temp.chk('downgrade to Solo: custom roles (Team only) is cancelled', pg_temp.fu('biza'), 'sa-roles:cancel:plan_change:false');
select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-biz-m', 'active', jsonb_build_object('modified_at', now() - interval '9 minutes', 'seats', 1)));
select pg_temp.chk('upgrade to Business: custom roles is included, so the add-on is cancelled', pg_temp.fu('biza'), 'sa-roles:cancel:plan_change:false');

select pg_temp.apply(pg_temp.snapshot('sa2', 'biza', 'bs53-team-m', 'active', jsonb_build_object('created_at', now() - interval '1 minute')));
select pg_temp.chk('a second live plan: the newer one is revoked and refunded',
  pg_temp.fu('biza'), 'sa-roles:cancel:plan_change:false,sa2:revoke:duplicate:true');
select pg_temp.chk('...the business keeps following the FIRST one (Business)', split_part(pg_temp.plan('biza'), '|', 1), 'business');
select pg_temp.apply(pg_temp.snapshot('sa-inv2', 'biza', 'bs53-inv-m', 'active', jsonb_build_object('created_at', now() - interval '2 minutes')));
select pg_temp.apply(pg_temp.snapshot('sa-inv3', 'biza', 'bs53-inv-m', 'active', jsonb_build_object('created_at', now() - interval '30 seconds')));
select pg_temp.chk('a second live add-on of the same kind: duplicate too',
  pg_temp.fu('biza'), 'sa-inv3:revoke:duplicate:true,sa-roles:cancel:plan_change:false,sa2:revoke:duplicate:true');

select pg_temp.apply(pg_temp.snapshot('sa1', 'biza', 'bs53-biz-m', 'canceled',
  jsonb_build_object('seats', 1, 'ended_at', now() - interval '1 minute', 'modified_at', now() - interval '8 minutes')));
select pg_temp.chk('the first plan ends; the duplicate is now the plan, nothing else to revoke',
  split_part(pg_temp.plan('biza'), '|', 1) || '|' || split_part(pg_temp.plan('biza'), '|', 2) || ' ' || pg_temp.fu('biza'),
  'team|active sa-inv3:revoke:duplicate:true');
select pg_temp.apply(pg_temp.snapshot('sa2', 'biza', 'bs53-team-m', 'canceled',
  jsonb_build_object('created_at', now() - interval '1 minute', 'ended_at', now(), 'modified_at', now())));
select pg_temp.chk('no live plan: the business is inactive (data kept)',
  split_part(pg_temp.plan('biza'), '|', 2) || '|' || public.business_is_active(pg_temp.id('biza'))::text, 'inactive|false');
select pg_temp.chk('...and every live add-on is revoked (plan ended)',
  pg_temp.fu('biza'), 'sa-inv2:revoke:plan_ended:false,sa-inv3:revoke:duplicate:true,sa-pkg-new:revoke:plan_ended:false,sa-roles:revoke:plan_ended:false');

select pg_temp.chk('manual business: only duplicates, no plan follow-ups',
  pg_temp.fu('bizb'), 'none');

select pg_temp.chk('mark_followup: bad reason', public.billing_mark_followup('sa-roles', 'because') ->> 'code', 'invalid_input');
select pg_temp.chk('mark_followup: unknown subscription', public.billing_mark_followup('nope', 'duplicate') ->> 'code', 'not_found');
select pg_temp.chk('mark_followup: audited',
  (select count(*)::text from public.audit_logs where business_id = pg_temp.id('biza') and action = 'billing.followup'), '1');

-- ---------------------------------------------------------------------------
-- 10. Webhook delivery dedupe
-- ---------------------------------------------------------------------------
select pg_temp.chk('begin: invalid input', public.billing_begin_event(null, 'x', null) ->> 'code', 'invalid_input');
select pg_temp.chk('begin: new delivery is processed', public.billing_begin_event('bs53-w1', 'subscription.updated', 'sa1') ->> 'process', 'true');
select pg_temp.chk('begin again before finish (a retry): processed again', public.billing_begin_event('bs53-w1', 'subscription.updated', 'sa1') ->> 'process', 'true');
select pg_temp.chk('finish with an error', public.billing_finish_event('bs53-w1', 'error', 'polar 503', pg_temp.id('biza')) ->> 'ok', 'true');
select pg_temp.chk('...stays unprocessed, 2 attempts',
  (select coalesce(processed_at::text, 'open') || '|' || attempts || '|' || error from public.billing_webhook_events where webhook_id = 'bs53-w1'), 'open|2|polar 503');
select pg_temp.chk('the retry is processed', public.billing_begin_event('bs53-w1', 'subscription.updated', 'sa1') ->> 'process', 'true');
select pg_temp.chk('finish ok', public.billing_finish_event('bs53-w1', 'applied', null, pg_temp.id('biza')) ->> 'ok', 'true');
select pg_temp.chk('a replay of a processed delivery is skipped', public.billing_begin_event('bs53-w1', 'subscription.updated', 'sa1') ->> 'process', 'false');
select pg_temp.chk('...stored: processed, result, business',
  (select (processed_at is not null)::text || '|' || result || '|' || coalesce(error, '-') || '|' || (business_id = pg_temp.id('biza'))::text
   from public.billing_webhook_events where webhook_id = 'bs53-w1'), 'true|applied|-|true');
select pg_temp.chk('finish: unknown delivery', public.billing_finish_event('nope', 'x', null, null) ->> 'code', 'not_found');

-- ---------------------------------------------------------------------------
-- 11. Refund audit
-- ---------------------------------------------------------------------------
insert into snap values ('a9', (select count(*)::text from public.audit_logs where business_id = pg_temp.id('biza')));
select pg_temp.chk('refund: bad amount', public.billing_record_refund(pg_temp.id('biza'), 'ord1', 'sa2', -1, 'USD', 'duplicate') ->> 'code', 'invalid_input');
select pg_temp.chk('refund: bad currency', public.billing_record_refund(pg_temp.id('biza'), 'ord1', 'sa2', 100, 'US', 'duplicate') ->> 'code', 'invalid_input');
select pg_temp.chk('refund: unknown business', public.billing_record_refund(gen_random_uuid(), 'ord1', 'sa2', 100, 'USD', 'duplicate') ->> 'code', 'not_found');
select pg_temp.chk('...no audit row from a refusal',
  (select count(*)::text from public.audit_logs where business_id = pg_temp.id('biza')), (select v from snap where k = 'a9'));
select pg_temp.chk('refund: ok', public.billing_record_refund(pg_temp.id('biza'), 'ord1', 'sa2', 3900, 'usd', 'duplicate') ->> 'ok', 'true');
select pg_temp.chk('...audited with the amount',
  (select entity_id || '|' || (after ->> 'refunded_minor') || '|' || (after ->> 'currency') || '|' || (after ->> 'reason')
   from public.audit_logs where business_id = pg_temp.id('biza') and action = 'billing.refunded'), 'ord1|3900|USD|duplicate');

-- ---------------------------------------------------------------------------
-- 12. Deleting a business with all of this cascades
-- ---------------------------------------------------------------------------
-- As the system (no signed-in user), like the tenant-delete path.
select set_config('request.jwt.claims', '', true);
select pg_temp.chk('delete from businesses: ok',
  pg_temp.q(format($q$with d as (delete from public.businesses where id = %L returning 1) select count(*)::text from d$q$, pg_temp.id('biza'))), '1');
select pg_temp.chk('...its subscriptions are gone', (select count(*)::text from public.billing_subscriptions where polar_subscription_id like 'sa%'), '0');

select
  count(*) filter (where pass) as passed,
  count(*) filter (where not pass) as failed,
  count(*) as total,
  coalesce(string_agg(n || ' ' || name || ': ' || detail, E'\n' order by n) filter (where not pass), '') as failures
from res;

rollback;
