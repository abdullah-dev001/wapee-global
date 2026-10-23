-- Polar billing, part 3: what the Edge Functions need from the database.
--
--   billing_prepare(business, action, args)   AUTHENTICATED. The `billing` Edge Function calls it
--                                              AS THE SIGNED-IN USER before it touches Polar: Owner
--                                              only (settings.billing), rate-limited, then every rule
--                                              (plan limits, add-on availability, one live plan,
--                                              seats >= locations, ...) checked here, and the exact
--                                              Polar call to make is returned. Nothing is written
--                                              except the rate-limit count and an audit row.
--   billing_reconcile_targets()                service_role: which subscriptions / businesses the
--                                              daily reconcile re-reads from Polar.
--   billing_cleanup_events()                   service_role: delivery rows older than 90 days.
--   invoke_billing_reconcile()                 cron, daily: calls the billing_reconcile Edge Function
--                                              with the same worker token as send_outbox (URL derived
--                                              from outbox_worker_url, so no new manual setting).
--
-- Actions and their args:
--   checkout      { kind: plan|addon, key, interval: month|year }
--   portal        {}
--   change_plan   { key, interval }            upgrade = charged now (invoice), downgrade = prorated
--                                              credit (prorate); refused over the new plan's limits
--   change_seats  { seats }                    per-location plan; never below the active locations
--   cancel / uncancel                          the plan, at period end (add-ons follow automatically)
--   remove_addon / keep_addon { key }          an add-on, at period end / undo that

insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('billing_action', 'biz', 3600, 60, 'Billing actions (checkout, portal, plan / seat changes): 60 an hour per business.'),
  ('billing_action', 'key', 3600, 60, 'Billing actions: 60 an hour per signed-in user (key = the user id).')
on conflict (endpoint, scope, window_seconds) do nothing;

-- The primary live subscription of a business's plan (kind 'plan') or of one add-on, ignoring
-- subscriptions a super admin detached. The same rule billing_derive uses.
create or replace function public.billing_primary(p_business_id uuid, p_kind text, p_key text)
returns public.billing_subscriptions language sql stable security definer set search_path = '' as $$
  select b.* from public.billing_subscriptions b
  left join public.business_subscriptions s on s.business_id = b.business_id
  left join public.business_addons ba on ba.business_id = b.business_id and ba.addon_key = b.key
  where b.business_id = p_business_id and b.kind = p_kind and b.live
    and (p_kind = 'plan' or b.key = p_key)
    and coalesce(b.polar_created_at > (case when p_kind = 'plan' then s.polar_detached_at else ba.polar_detached_at end), true)
  order by b.polar_created_at, b.polar_subscription_id
  limit 1
$$;
revoke all on function public.billing_primary(uuid, text, text) from public, anon, authenticated;

-- Monthly-equivalent price of a plan / add-on (for upgrade vs downgrade only; never stored).
create or replace function public.billing_monthly_equivalent(p_kind text, p_key text, p_interval text, p_seats integer)
returns numeric language sql stable security definer set search_path = '' as $$
  select (case when p_interval = 'year' then x.y / 12.0 else x.m end) * greatest(coalesce(p_seats, 1), 1)
  from (select p.price_monthly_minor m, p.price_annual_minor y from public.plans p where p_kind = 'plan' and p.key::text = p_key
        union all
        select a.price_monthly_minor, a.price_annual_minor from public.addons a where p_kind = 'addon' and a.key = p_key) x
$$;
revoke all on function public.billing_monthly_equivalent(text, text, text, integer) from public, anon, authenticated;

create or replace function public.billing_prepare(p_business_id uuid, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_s record;
  v_rl jsonb;
  v_plan public.billing_subscriptions;
  v_addon public.billing_subscriptions;
  v_kind text; v_key text; v_interval text;
  v_product text;
  v_price bigint; v_currency text; v_per_branch boolean;
  v_branches integer; v_seats integer;
  v_viol jsonb;
  v_trial_days integer;
  v_email text;
  v_new numeric; v_old numeric;
  v_allowed boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_action is null or p_action not in ('checkout', 'portal', 'change_plan', 'change_seats', 'cancel', 'uncancel',
                                          'remove_addon', 'keep_addon')
     or jsonb_typeof(v_args) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  select s.* into v_s from public.business_subscriptions s
  join public.businesses b on b.id = s.business_id and b.deleted_at is null
  where s.business_id = p_business_id;
  if not found or not public.has_permission(p_business_id, null, 'settings.billing') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  -- Counted before anything else can fail: a refused attempt is still an attempt.
  v_rl := public.check_rate_limit('billing_action', null, v_uid::text, p_business_id);
  if not coalesce((v_rl ->> 'allowed')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after_seconds', v_rl -> 'retry_after_seconds');
  end if;
  if v_s.status = 'suspended' and p_action <> 'portal' then
    return jsonb_build_object('ok', false, 'code', 'suspended');
  end if;

  v_plan := public.billing_primary(p_business_id, 'plan', null);
  select count(*) into v_branches from public.branches b where b.business_id = p_business_id and b.deleted_at is null;

  -- ----- portal ------------------------------------------------------------
  if p_action = 'portal' then
    if not exists (select 1 from public.billing_subscriptions b where b.business_id = p_business_id) then
      return jsonb_build_object('ok', false, 'code', 'no_billing_account');
    end if;
    return jsonb_build_object('ok', true, 'action', 'portal', 'business_id', p_business_id);
  end if;

  -- ----- cancel / uncancel (the plan) ----------------------------------------
  if p_action in ('cancel', 'uncancel') then
    if v_plan.polar_subscription_id is null or v_s.billing_source <> 'polar' then
      return jsonb_build_object('ok', false, 'code', 'no_subscription');
    end if;
    if (p_action = 'cancel') = v_plan.cancel_at_period_end then
      return jsonb_build_object('ok', false, 'code', 'no_change');
    end if;
    perform public.write_audit_log(p_business_id, 'billing.' || p_action || '_requested', 'billing_subscription',
      v_plan.polar_subscription_id, null, null);
    return jsonb_build_object('ok', true, 'action', p_action, 'business_id', p_business_id,
      'subscription_id', v_plan.polar_subscription_id, 'cancel_at_period_end', p_action = 'cancel');
  end if;

  -- ----- remove_addon / keep_addon ---------------------------------------------
  if p_action in ('remove_addon', 'keep_addon') then
    v_key := v_args ->> 'key';
    if v_key is null or not exists (select 1 from public.addons a where a.key = v_key) then
      return jsonb_build_object('ok', false, 'code', 'invalid_input');
    end if;
    v_addon := public.billing_primary(p_business_id, 'addon', v_key);
    if v_addon.polar_subscription_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_subscription');
    end if;
    if (p_action = 'remove_addon') = v_addon.cancel_at_period_end then
      return jsonb_build_object('ok', false, 'code', 'no_change');
    end if;
    if p_action = 'keep_addon' then
      -- Only while the plan still runs and still allows it.
      if v_plan.polar_subscription_id is null or v_plan.cancel_at_period_end then
        return jsonb_build_object('ok', false, 'code', 'plan_required');
      end if;
      v_allowed := not coalesce((select (p.features ->> v_key)::boolean from public.plans p where p.key::text = v_plan.key), false)
               and coalesce((select a.available_plans is null or v_plan.key::public.business_plan = any (a.available_plans)
                             from public.addons a where a.key = v_key), false);
      if not v_allowed then return jsonb_build_object('ok', false, 'code', 'addon_unavailable'); end if;
    end if;
    perform public.write_audit_log(p_business_id, 'billing.' || p_action || '_requested', 'billing_subscription',
      v_addon.polar_subscription_id, null, jsonb_build_object('addon', v_key));
    return jsonb_build_object('ok', true, 'action', p_action, 'business_id', p_business_id,
      'subscription_id', v_addon.polar_subscription_id, 'cancel_at_period_end', p_action = 'remove_addon');
  end if;

  -- ----- change_seats ----------------------------------------------------------
  if p_action = 'change_seats' then
    if v_plan.polar_subscription_id is null or v_s.billing_source <> 'polar' then
      return jsonb_build_object('ok', false, 'code', 'no_subscription');
    end if;
    if not exists (select 1 from public.plans p where p.key::text = v_plan.key and p.priced_per_branch) then
      return jsonb_build_object('ok', false, 'code', 'not_per_location');
    end if;
    if jsonb_typeof(v_args -> 'seats') <> 'number' or (v_args ->> 'seats') !~ '^[0-9]{1,4}$' then
      return jsonb_build_object('ok', false, 'code', 'invalid_input');
    end if;
    v_seats := (v_args ->> 'seats')::integer;
    if v_seats < greatest(v_branches, 1) or v_seats > 1000 then
      return jsonb_build_object('ok', false, 'code', 'invalid_seats', 'min', greatest(v_branches, 1), 'max', 1000);
    end if;
    if v_seats = v_plan.seats then return jsonb_build_object('ok', false, 'code', 'no_change'); end if;
    if v_plan.cancel_at_period_end then return jsonb_build_object('ok', false, 'code', 'cancel_scheduled'); end if;
    if v_plan.polar_status = 'past_due' then return jsonb_build_object('ok', false, 'code', 'payment_overdue'); end if;
    perform public.write_audit_log(p_business_id, 'billing.change_seats_requested', 'billing_subscription',
      v_plan.polar_subscription_id, jsonb_build_object('seats', v_plan.seats), jsonb_build_object('seats', v_seats));
    return jsonb_build_object('ok', true, 'action', 'change_seats', 'business_id', p_business_id,
      'subscription_id', v_plan.polar_subscription_id, 'seats', v_seats,
      'proration', case when v_seats > v_plan.seats then 'invoice' else 'prorate' end);
  end if;

  -- ----- checkout / change_plan: resolve the product ---------------------------
  v_kind := case when p_action = 'change_plan' then 'plan' else v_args ->> 'kind' end;
  v_key := v_args ->> 'key';
  v_interval := v_args ->> 'interval';
  if v_kind is null or v_kind not in ('plan', 'addon') or v_key is null or v_interval is null or v_interval not in ('month', 'year') then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if v_kind = 'plan' then
    select case when v_interval = 'year' then p.price_annual_minor else p.price_monthly_minor end, p.currency, p.priced_per_branch
      into v_price, v_currency, v_per_branch
    from public.plans p where p.key::text = v_key and p.active;
  else
    select case when v_interval = 'year' then a.price_annual_minor else a.price_monthly_minor end, a.currency, false
      into v_price, v_currency, v_per_branch
    from public.addons a where a.key = v_key and a.active;
  end if;
  if v_currency is null then return jsonb_build_object('ok', false, 'code', 'invalid_input'); end if;
  select bp.polar_product_id into v_product from public.billing_products bp
  where bp.kind = v_kind and bp.key = v_key and bp.interval = v_interval and bp.active;
  if v_product is null or v_price is null then return jsonb_build_object('ok', false, 'code', 'not_available'); end if;
  v_seats := case when v_per_branch then greatest(v_branches, 1) end;

  if p_action = 'change_plan' then
    if v_plan.polar_subscription_id is null or v_s.billing_source <> 'polar' then
      return jsonb_build_object('ok', false, 'code', 'no_subscription');
    end if;
    if v_plan.key = v_key and v_plan.interval = v_interval then return jsonb_build_object('ok', false, 'code', 'no_change'); end if;
    if v_plan.cancel_at_period_end then return jsonb_build_object('ok', false, 'code', 'cancel_scheduled'); end if;
    if v_plan.polar_status = 'past_due' then return jsonb_build_object('ok', false, 'code', 'payment_overdue'); end if;
    v_viol := public.plan_limit_violations(p_business_id, v_key::public.business_plan);
    if (v_viol ->> 'violated')::boolean then
      return jsonb_build_object('ok', false, 'code', 'over_limit',
        'staff_over_cap', v_viol -> 'staff_over_cap', 'branches_over', v_viol -> 'branches_over');
    end if;
    -- Keep the paid seats when staying on a per-location plan (never below the locations).
    if v_per_branch then v_seats := greatest(coalesce(v_plan.seats, 0), v_seats); end if;
    v_new := public.billing_monthly_equivalent('plan', v_key, v_interval, v_seats);
    v_old := public.billing_monthly_equivalent('plan', v_plan.key, v_plan.interval, v_plan.seats);
    perform public.write_audit_log(p_business_id, 'billing.change_plan_requested', 'billing_subscription', v_plan.polar_subscription_id,
      jsonb_build_object('key', v_plan.key, 'interval', v_plan.interval, 'seats', v_plan.seats),
      jsonb_build_object('key', v_key, 'interval', v_interval, 'seats', v_seats));
    return jsonb_build_object('ok', true, 'action', 'change_plan', 'business_id', p_business_id,
      'subscription_id', v_plan.polar_subscription_id, 'product_id', v_product, 'kind', 'plan', 'key', v_key,
      'interval', v_interval, 'price_minor', v_price, 'currency', v_currency, 'seats', v_seats,
      'proration', case when v_new >= v_old then 'invoice' else 'prorate' end);
  end if;

  -- ----- checkout ----------------------------------------------------------------
  if v_kind = 'plan' then
    if v_plan.polar_subscription_id is not null then return jsonb_build_object('ok', false, 'code', 'already_subscribed'); end if;
    v_viol := public.plan_limit_violations(p_business_id, v_key::public.business_plan);
    if (v_viol ->> 'violated')::boolean then
      return jsonb_build_object('ok', false, 'code', 'over_limit',
        'staff_over_cap', v_viol -> 'staff_over_cap', 'branches_over', v_viol -> 'branches_over');
    end if;
    -- Founder decision: subscribing during the free trial keeps the days left (charged at its end).
    if v_s.status = 'trialing' and v_s.trial_ends_at > now()
       and not exists (select 1 from public.billing_subscriptions b where b.business_id = p_business_id and b.kind = 'plan') then
      v_trial_days := ceil(extract(epoch from v_s.trial_ends_at - now()) / 86400.0)::integer;
    end if;
  else
    if v_plan.polar_subscription_id is null or v_s.billing_source <> 'polar' then
      return jsonb_build_object('ok', false, 'code', 'plan_required');
    end if;
    if v_plan.cancel_at_period_end then return jsonb_build_object('ok', false, 'code', 'cancel_scheduled'); end if;
    if v_interval <> v_plan.interval then return jsonb_build_object('ok', false, 'code', 'interval_mismatch'); end if;
    if coalesce((select (p.features ->> v_key)::boolean from public.plans p where p.key::text = v_plan.key), false) then
      return jsonb_build_object('ok', false, 'code', 'addon_included');
    end if;
    if not coalesce((select a.available_plans is null or v_plan.key::public.business_plan = any (a.available_plans)
                     from public.addons a where a.key = v_key), false) then
      return jsonb_build_object('ok', false, 'code', 'addon_unavailable');
    end if;
    v_addon := public.billing_primary(p_business_id, 'addon', v_key);
    if v_addon.polar_subscription_id is not null then
      return jsonb_build_object('ok', false, 'code', 'already_subscribed');
    end if;
    -- An add-on bought while the plan is still in its (Polar) trial is charged when the plan is.
    if v_plan.polar_status = 'trialing' and v_plan.current_period_end > now() then
      v_trial_days := ceil(extract(epoch from v_plan.current_period_end - now()) / 86400.0)::integer;
    end if;
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  perform public.write_audit_log(p_business_id, 'billing.checkout_started', v_kind, v_key, null,
    jsonb_build_object('interval', v_interval, 'seats', v_seats, 'trial_days', v_trial_days));
  return jsonb_build_object('ok', true, 'action', 'checkout', 'business_id', p_business_id, 'user_id', v_uid,
    'product_id', v_product, 'kind', v_kind, 'key', v_key, 'interval', v_interval,
    'price_minor', v_price, 'currency', v_currency, 'seats', v_seats,
    'trial_days', v_trial_days, 'customer_email', v_email);
end $$;
revoke all on function public.billing_prepare(uuid, text, jsonb) from public, anon;
grant execute on function public.billing_prepare(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reconcile support
-- ---------------------------------------------------------------------------
create or replace function public.billing_reconcile_targets()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'subscriptions', coalesce((select jsonb_agg(b.polar_subscription_id order by b.polar_subscription_id)
                               from public.billing_subscriptions b
                               where b.live or b.access_until > now() - interval '2 days'), '[]'::jsonb),
    'businesses', coalesce((select jsonb_agg(distinct b.business_id)
                            from public.billing_subscriptions b where b.live), '[]'::jsonb))
$$;
revoke all on function public.billing_reconcile_targets() from public, anon, authenticated;
grant execute on function public.billing_reconcile_targets() to service_role;

create or replace function public.billing_cleanup_events()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  delete from public.billing_webhook_events where received_at < now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.billing_cleanup_events() from public, anon, authenticated;
grant execute on function public.billing_cleanup_events() to service_role;

-- Daily: the billing_reconcile Edge Function (re-reads Polar, fixes drift, runs follow-ups,
-- deletes old delivery rows). Same worker token as send_outbox; its URL is the outbox worker's
-- with the function name swapped, so no extra Vault secret is needed.
create or replace function public.invoke_billing_reconcile()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_url text := public.internal_secret('outbox_worker_url');
  v_token text := public.internal_secret('outbox_worker_token');
begin
  if v_url is null or v_token is null or v_url !~ '/send_outbox$' then return null; end if;
  return net.http_post(
    url := regexp_replace(v_url, '/send_outbox$', '/billing_reconcile'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token', v_token),
    timeout_milliseconds := 55000);
end $$;
revoke all on function public.invoke_billing_reconcile() from public, anon, authenticated;

select cron.schedule('billing-reconcile', '17 3 * * *', $$select public.invoke_billing_reconcile()$$);
