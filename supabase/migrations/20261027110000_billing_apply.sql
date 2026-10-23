-- Polar billing, part 2: applying a Polar subscription to the database. Everything here is
-- service_role only: the polar_webhook / billing / billing_reconcile Edge Functions call it after
-- re-reading the subscription from Polar's API (a webhook payload is never trusted as state).
--
--   billing_apply_subscription(snapshot)  validate everything, then upsert ONE
--                                         billing_subscriptions row and re-derive the business's
--                                         plan / status / period end and add-on access from all
--                                         of its Polar subscriptions (billing_derive). Out-of-
--                                         order or repeated snapshots are refused as 'stale'.
--   billing_followups(business)           what the Edge Function must do in Polar so add-ons
--                                         follow the plan automatically: cancel at period end
--                                         when the plan is cancelled / changed to a plan without
--                                         that add-on, uncancel when the plan is uncancelled,
--                                         revoke when the plan has ended, revoke (+ refund)
--                                         duplicates.
--   billing_mark_followup(id, reason)     records that a follow-up was done.
--   billing_begin_event / finish_event    webhook delivery dedupe (a failed delivery is retried).
--   billing_record_refund                 audit row for a refund (money is audited).
--
-- Access rule (founder decisions 2026-10-23):
--   active / trialing        access until period end + 7 days (grace for a failed renewal)
--   cancel at period end     access until period end (no grace: the owner chose to stop)
--   past_due                 access until 7 days after it first went past due
--   canceled (ended), unpaid, paused, incomplete*   no access
-- The plan's access end is written to business_subscriptions.current_period_end, which the
-- existing rule (business_is_active) already enforces; an add-on's to business_addons.access_until.
-- A suspended business stays suspended whatever Polar says.

create or replace function public.billing_grace()
returns interval language sql immutable set search_path = '' as $$ select interval '7 days' $$;
comment on function public.billing_grace is
  'Access after a failed renewal (founder decision 2026-10-23: 7 days).';
revoke all on function public.billing_grace() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- billing_derive: business_subscriptions / business_addons from billing_subscriptions.
-- The PRIMARY subscription of a plan or add-on = the earliest-created live one; if none is live,
-- the most recently changed ended one. Subscriptions created before a super admin detached the
-- plan / add-on (polar_detached_at) are ignored, and an ended subscription never takes over a
-- manual plan / add-on. Internal: called by billing_apply_subscription only.
-- ---------------------------------------------------------------------------
create or replace function public.billing_derive(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_p record;
  v_status public.business_status;
  v_start timestamptz;
  v_key text;
  v_ba record;
  v_a record;
  v_changes jsonb := '[]'::jsonb;
begin
  select s.* into v_s from public.business_subscriptions s where s.business_id = p_business_id for update;
  if not found then return v_changes; end if;

  -- Plan
  select b.* into v_p from public.billing_subscriptions b
  where b.business_id = p_business_id and b.kind = 'plan'
    and b.polar_status not in ('incomplete', 'incomplete_expired')
    and (v_s.polar_detached_at is null or b.polar_created_at > v_s.polar_detached_at)
  order by b.live desc, (case when b.live then b.polar_created_at end) asc nulls last,
           b.polar_modified_at desc, b.polar_subscription_id
  limit 1;
  if v_p.polar_subscription_id is not null and (v_s.billing_source = 'polar' or v_p.live) then
    v_status := case when v_s.status = 'suspended' then 'suspended'
                     when v_p.live then 'active' else 'inactive' end;
    -- The table requires end > start. Access can end before Polar's current period started (grace
    -- over after Polar already rolled the period forward, or revoked at a boundary): then the
    -- start is pulled just below the end instead of failing the whole apply (and every retry).
    v_start := least(coalesce(v_p.current_period_start, v_s.current_period_start), v_p.access_until - interval '1 second');
    if v_s.billing_source is distinct from 'polar' or v_s.plan is distinct from v_p.key::public.business_plan
       or v_s.status is distinct from v_status or v_s.current_period_end is distinct from v_p.access_until
       or v_s.current_period_start is distinct from v_start then
      update public.business_subscriptions
         set billing_source = 'polar', plan = v_p.key::public.business_plan, status = v_status,
             current_period_end = v_p.access_until, current_period_start = v_start
       where business_id = p_business_id;
      perform public.write_audit_log(p_business_id, 'billing.plan_synced', 'billing_subscription', v_p.polar_subscription_id,
        jsonb_build_object('plan', v_s.plan, 'status', v_s.status, 'billing_source', v_s.billing_source, 'access_until', v_s.current_period_end),
        jsonb_build_object('plan', v_p.key, 'status', v_status, 'billing_source', 'polar', 'access_until', v_p.access_until));
      v_changes := v_changes || jsonb_build_object('kind', 'plan', 'key', v_p.key, 'status', v_status);
    end if;
  end if;

  -- Add-ons
  for v_key in select distinct b.key from public.billing_subscriptions b
               where b.business_id = p_business_id and b.kind = 'addon' order by 1 loop
    select ba.* into v_ba from public.business_addons ba
    where ba.business_id = p_business_id and ba.addon_key = v_key for update;
    select b.* into v_a from public.billing_subscriptions b
    where b.business_id = p_business_id and b.kind = 'addon' and b.key = v_key
      and b.polar_status not in ('incomplete', 'incomplete_expired')
      and (v_ba.polar_detached_at is null or b.polar_created_at > v_ba.polar_detached_at)
    order by b.live desc, (case when b.live then b.polar_created_at end) asc nulls last,
             b.polar_modified_at desc, b.polar_subscription_id
    limit 1;
    continue when v_a.polar_subscription_id is null;
    continue when coalesce(v_ba.source, 'manual') = 'manual' and not v_a.live;
    if v_ba.addon_key is null or v_ba.source <> 'polar' or v_ba.enabled <> v_a.live
       or v_ba.access_until is distinct from v_a.access_until then
      insert into public.business_addons (business_id, addon_key, enabled, enabled_by, source, access_until)
      values (p_business_id, v_key, v_a.live, null, 'polar', v_a.access_until)
      on conflict (business_id, addon_key) do update
        set enabled = excluded.enabled, enabled_by = null, source = 'polar', access_until = excluded.access_until;
      perform public.write_audit_log(p_business_id, 'billing.addon_synced', 'billing_subscription', v_a.polar_subscription_id,
        jsonb_build_object('addon', v_key, 'enabled', v_ba.enabled, 'source', v_ba.source, 'access_until', v_ba.access_until),
        jsonb_build_object('addon', v_key, 'enabled', v_a.live, 'source', 'polar', 'access_until', v_a.access_until));
      v_changes := v_changes || jsonb_build_object('kind', 'addon', 'key', v_key, 'enabled', v_a.live);
    end if;
  end loop;
  return v_changes;
end $$;
revoke all on function public.billing_derive(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- billing_apply_subscription
-- Snapshot (built by the Edge Functions from GET /v1/subscriptions/{id}):
--   { id, customer_id, external_customer_id, metadata_business_id, product_id, status,
--     recurring_interval, seats, cancel_at_period_end, current_period_start, current_period_end,
--     ended_at, past_due_at, created_at, modified_at }
-- Returns { ok, code } and never raises for bad input: 'applied', 'stale', or a refusal code
-- (invalid_snapshot, unknown_product, interval_mismatch, not_found, business_mismatch).
-- ---------------------------------------------------------------------------
create or replace function public.billing_apply_subscription(p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id text; v_customer text; v_product text; v_status text; v_interval text;
  v_ext text; v_meta text; v_business uuid;
  v_seats integer; v_cancel boolean;
  v_start timestamptz; v_end timestamptz; v_ended timestamptz; v_past_due_at timestamptz;
  v_created timestamptz; v_modified timestamptz;
  v_prod record; v_old record;
  v_live boolean; v_since timestamptz; v_access timestamptz;
  v_derived jsonb;
begin
  -- 1. Shape. Every cast is checked here, before anything is written.
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid_snapshot');
  end if;
  v_id := p_snapshot ->> 'id';
  v_customer := p_snapshot ->> 'customer_id';
  v_product := p_snapshot ->> 'product_id';
  v_status := p_snapshot ->> 'status';
  v_interval := p_snapshot ->> 'recurring_interval';
  v_ext := nullif(p_snapshot ->> 'external_customer_id', '');
  v_meta := nullif(p_snapshot ->> 'metadata_business_id', '');
  if v_id is null or char_length(v_id) not between 1 and 100
     or v_customer is null or char_length(v_customer) not between 1 and 100
     or v_product is null or char_length(v_product) not between 1 and 100
     or v_status is null or v_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
     or (v_ext is null and v_meta is null)
     or (v_ext is not null and v_meta is not null and v_ext <> v_meta)
     or jsonb_typeof(coalesce(p_snapshot -> 'cancel_at_period_end', 'false'::jsonb)) <> 'boolean' then
    return jsonb_build_object('ok', false, 'code', 'invalid_snapshot');
  end if;
  begin
    v_business := coalesce(v_ext, v_meta)::uuid;
    v_seats := (p_snapshot ->> 'seats')::integer;
    v_cancel := coalesce((p_snapshot ->> 'cancel_at_period_end')::boolean, false);
    v_start := (p_snapshot ->> 'current_period_start')::timestamptz;
    v_end := (p_snapshot ->> 'current_period_end')::timestamptz;
    v_ended := (p_snapshot ->> 'ended_at')::timestamptz;
    v_past_due_at := (p_snapshot ->> 'past_due_at')::timestamptz;
    v_created := (p_snapshot ->> 'created_at')::timestamptz;
    v_modified := coalesce((p_snapshot ->> 'modified_at')::timestamptz, v_created);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_snapshot');
  end;
  if v_created is null or (v_status in ('trialing', 'active', 'past_due') and v_end is null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_snapshot');
  end if;

  -- 2. What it is a subscription to.
  select bp.kind, bp.key, bp.interval into v_prod from public.billing_products bp where bp.polar_product_id = v_product;
  if not found then return jsonb_build_object('ok', false, 'code', 'unknown_product'); end if;
  if v_interval is distinct from v_prod.interval then
    return jsonb_build_object('ok', false, 'code', 'interval_mismatch');
  end if;
  if v_prod.kind = 'plan' and exists (select 1 from public.plans p where p.key::text = v_prod.key and p.priced_per_branch) then
    if v_seats is null or v_seats not between 1 and 1000 then
      return jsonb_build_object('ok', false, 'code', 'invalid_snapshot');
    end if;
  else
    v_seats := null;
  end if;

  -- 3. Whose, and is it newer than what we have.
  if not exists (select 1 from public.businesses b where b.id = v_business and b.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  select b.* into v_old from public.billing_subscriptions b where b.polar_subscription_id = v_id for update;
  if found then
    if v_old.business_id <> v_business or v_old.kind <> v_prod.kind
       or (v_prod.kind = 'addon' and v_old.key <> v_prod.key) then
      return jsonb_build_object('ok', false, 'code', 'business_mismatch');
    end if;
    if v_modified <= v_old.polar_modified_at then
      return jsonb_build_object('ok', true, 'code', 'stale', 'business_id', v_business);
    end if;
  end if;

  -- 4. Access.
  v_since := case when v_status = 'past_due' then coalesce(v_old.past_due_since, v_past_due_at, now()) end;
  v_live := v_status in ('trialing', 'active', 'past_due')
         or (v_status = 'canceled' and v_ended is null and v_end > now());
  v_access := case
    when not v_live then coalesce(v_ended, now())
    when v_status = 'past_due' then v_since + public.billing_grace()
    when v_cancel or v_status = 'canceled' then v_end
    else v_end + public.billing_grace() end;

  -- 5. Write once, then derive.
  insert into public.billing_subscriptions (polar_subscription_id, business_id, polar_customer_id, polar_product_id, kind, key, interval,
    polar_status, seats, cancel_at_period_end, current_period_start, current_period_end, ended_at, past_due_since,
    live, access_until, polar_created_at, polar_modified_at)
  values (v_id, v_business, v_customer, v_product, v_prod.kind, v_prod.key, v_prod.interval,
    v_status, v_seats, v_cancel, v_start, v_end, v_ended, v_since, v_live, v_access, v_created, v_modified)
  on conflict (polar_subscription_id) do update
    set polar_customer_id = excluded.polar_customer_id, polar_product_id = excluded.polar_product_id,
        key = excluded.key, interval = excluded.interval, polar_status = excluded.polar_status,
        seats = excluded.seats, cancel_at_period_end = excluded.cancel_at_period_end,
        current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
        ended_at = excluded.ended_at, past_due_since = excluded.past_due_since, live = excluded.live,
        access_until = excluded.access_until, polar_modified_at = excluded.polar_modified_at;

  if v_old.polar_subscription_id is null or v_old.polar_status <> v_status or v_old.cancel_at_period_end <> v_cancel
     or v_old.seats is distinct from v_seats or v_old.key <> v_prod.key or v_old.interval <> v_prod.interval then
    perform public.write_audit_log(v_business, 'billing.subscription_updated', 'billing_subscription', v_id,
      case when v_old.polar_subscription_id is null then null else jsonb_build_object(
        'key', v_old.key, 'interval', v_old.interval, 'status', v_old.polar_status,
        'cancel_at_period_end', v_old.cancel_at_period_end, 'seats', v_old.seats) end,
      jsonb_build_object('kind', v_prod.kind, 'key', v_prod.key, 'interval', v_prod.interval, 'status', v_status,
        'cancel_at_period_end', v_cancel, 'seats', v_seats, 'access_until', v_access));
  end if;

  v_derived := public.billing_derive(v_business);
  return jsonb_build_object('ok', true, 'code', 'applied', 'business_id', v_business,
    'kind', v_prod.kind, 'key', v_prod.key, 'live', v_live, 'access_until', v_access, 'changes', v_derived);
end $$;
revoke all on function public.billing_apply_subscription(jsonb) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- billing_followups: the Polar actions that keep add-ons in step with the plan.
-- [{ subscription_id, action: cancel | uncancel | revoke, reason, refund }]
-- ---------------------------------------------------------------------------
create or replace function public.billing_followups(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_s record;
  v_plan record;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_allowed boolean;
begin
  select s.* into v_s from public.business_subscriptions s where s.business_id = p_business_id;
  if not found then return v_out; end if;

  -- Duplicates: every live subscription of the same plan (any plan) / add-on other than its
  -- primary (the earliest-created). Subscriptions a super admin detached are left alone.
  for r in
    select e.polar_subscription_id from (
      select b.polar_subscription_id,
             row_number() over (partition by b.kind, case when b.kind = 'addon' then b.key end
                                order by b.polar_created_at, b.polar_subscription_id) as rn
      from public.billing_subscriptions b
      left join public.business_addons ba
        on b.kind = 'addon' and ba.business_id = b.business_id and ba.addon_key = b.key
      where b.business_id = p_business_id and b.live
        and coalesce(b.polar_created_at > (case when b.kind = 'plan' then v_s.polar_detached_at
                                                else ba.polar_detached_at end), true)
    ) e where e.rn > 1
  loop
    v_out := v_out || jsonb_build_object('subscription_id', r.polar_subscription_id, 'action', 'revoke',
                                         'reason', 'duplicate', 'refund', true);
  end loop;

  if v_s.billing_source <> 'polar' then return v_out; end if;

  select b.* into v_plan from public.billing_subscriptions b
  where b.business_id = p_business_id and b.kind = 'plan' and b.live
    and (v_s.polar_detached_at is null or b.polar_created_at > v_s.polar_detached_at)
  order by b.polar_created_at, b.polar_subscription_id limit 1;

  for r in
    select b.* from public.billing_subscriptions b
    left join public.business_addons ba on ba.business_id = b.business_id and ba.addon_key = b.key
    where b.business_id = p_business_id and b.kind = 'addon' and b.live
      and coalesce(b.polar_created_at > ba.polar_detached_at, true)
      and not (v_out @> jsonb_build_array(jsonb_build_object('subscription_id', b.polar_subscription_id)))
    order by b.polar_created_at
  loop
    if v_plan.polar_subscription_id is null then
      v_out := v_out || jsonb_build_object('subscription_id', r.polar_subscription_id, 'action', 'revoke',
                                           'reason', 'plan_ended', 'refund', false);
      continue;
    end if;
    v_allowed := not coalesce((select (p.features ->> r.key)::boolean from public.plans p where p.key::text = v_plan.key), false)
             and coalesce((select a.available_plans is null or v_plan.key::public.business_plan = any (a.available_plans) from public.addons a where a.key = r.key), false);
    if not v_allowed then
      if not r.cancel_at_period_end then
        v_out := v_out || jsonb_build_object('subscription_id', r.polar_subscription_id, 'action', 'cancel',
                                             'reason', 'plan_change', 'refund', false);
      end if;
    elsif v_plan.cancel_at_period_end and not r.cancel_at_period_end then
      v_out := v_out || jsonb_build_object('subscription_id', r.polar_subscription_id, 'action', 'cancel',
                                           'reason', 'plan_cancel', 'refund', false);
    elsif not v_plan.cancel_at_period_end and r.cancel_at_period_end and r.followup = 'plan_cancel' then
      v_out := v_out || jsonb_build_object('subscription_id', r.polar_subscription_id, 'action', 'uncancel',
                                           'reason', 'plan_cancel', 'refund', false);
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.billing_followups(uuid) from public, anon, authenticated;
grant execute on function public.billing_followups(uuid) to service_role;

-- Records a follow-up the Edge Function carried out (null clears it, after an uncancel).
create or replace function public.billing_mark_followup(p_subscription_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
begin
  if p_reason is not null and p_reason not in ('plan_cancel', 'plan_change', 'plan_ended', 'duplicate') then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  select b.business_id into v_business from public.billing_subscriptions b where b.polar_subscription_id = p_subscription_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  update public.billing_subscriptions set followup = p_reason where polar_subscription_id = p_subscription_id;
  perform public.write_audit_log(v_business, 'billing.followup', 'billing_subscription', p_subscription_id,
    null, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.billing_mark_followup(text, text) from public, anon, authenticated;
grant execute on function public.billing_mark_followup(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Webhook deliveries. begin: { process } (false = already processed). A delivery that failed
-- (finish with an error) stays unprocessed, so Polar's retry processes it again.
-- ---------------------------------------------------------------------------
create or replace function public.billing_begin_event(p_webhook_id text, p_type text, p_subscription_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_done timestamptz;
begin
  if p_webhook_id is null or char_length(p_webhook_id) not between 1 and 200
     or p_type is null or char_length(p_type) not between 1 and 80
     or (p_subscription_id is not null and char_length(p_subscription_id) > 100) then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  insert into public.billing_webhook_events (webhook_id, event_type, polar_subscription_id)
  values (p_webhook_id, p_type, p_subscription_id)
  on conflict (webhook_id) do nothing;
  if found then return jsonb_build_object('ok', true, 'process', true); end if;
  select e.processed_at into v_done from public.billing_webhook_events e where e.webhook_id = p_webhook_id for update;
  if v_done is not null then return jsonb_build_object('ok', true, 'process', false); end if;
  update public.billing_webhook_events set attempts = attempts + 1, error = null where webhook_id = p_webhook_id;
  return jsonb_build_object('ok', true, 'process', true);
end $$;
revoke all on function public.billing_begin_event(text, text, text) from public, anon, authenticated;
grant execute on function public.billing_begin_event(text, text, text) to service_role;

create or replace function public.billing_finish_event(p_webhook_id text, p_result text, p_error text, p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.billing_webhook_events
     set processed_at = case when p_error is null then now() end,
         result = left(p_result, 80), error = left(p_error, 300),
         business_id = case when exists (select 1 from public.businesses b where b.id = p_business_id)
                            then p_business_id else business_id end
   where webhook_id = p_webhook_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.billing_finish_event(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.billing_finish_event(text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Refund audit (the refund itself happens in Polar).
-- ---------------------------------------------------------------------------
create or replace function public.billing_record_refund(
  p_business_id uuid, p_order_id text, p_subscription_id text, p_refunded_minor bigint, p_currency text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_order_id is null or char_length(p_order_id) not between 1 and 100
     or p_refunded_minor is null or p_refunded_minor < 0
     or p_currency is null or p_currency !~ '^[A-Za-z]{3}$'
     or (p_reason is not null and char_length(p_reason) > 40) then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  perform public.write_audit_log(p_business_id, 'billing.refunded', 'polar_order', p_order_id, null,
    jsonb_build_object('subscription_id', p_subscription_id, 'refunded_minor', p_refunded_minor,
                       'currency', upper(p_currency), 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.billing_record_refund(uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.billing_record_refund(uuid, text, text, bigint, text, text) to service_role;
