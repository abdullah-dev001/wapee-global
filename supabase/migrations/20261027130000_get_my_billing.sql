-- Polar billing part 4 (read): get_my_billing
--
-- One read the Owner billing screen (settings.billing) calls to render the live Polar state that
-- my_features() / useBillingInfo do not carry: the primary plan subscription (interval, seats,
-- cancel-at-period-end, the past-due "update by" date), the live add-on subscriptions, and whether
-- a Polar customer exists yet (so the screen can offer "Manage payment & invoices"). Plan prices
-- and the catalogue come from get_public_pricing; this is only the business's own current state.
--
-- SECURITY DEFINER with the same gate as billing_prepare: a signed-in member who holds
-- settings.billing on the business. Never trusts the client for the business's billing state.

create or replace function public.get_my_billing(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_s record;
  v_plan public.billing_subscriptions;
  v_addons jsonb;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select s.* into v_s
  from public.business_subscriptions s
  join public.businesses b on b.id = s.business_id and b.deleted_at is null
  where s.business_id = p_business_id;
  if not found or not public.has_permission(p_business_id, null, 'settings.billing') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  v_plan := public.billing_primary(p_business_id, 'plan', null);

  -- Every live add-on, its primary subscription (detached ones ignored, same rule as billing_primary).
  select coalesce(jsonb_agg(a.obj order by a.key), '[]'::jsonb) into v_addons
  from (
    select distinct on (b.key) b.key,
      jsonb_build_object(
        'key', b.key,
        'interval', b.interval,
        'polar_status', b.polar_status,
        'cancel_at_period_end', b.cancel_at_period_end,
        'access_until', b.access_until
      ) as obj
    from public.billing_subscriptions b
    left join public.business_addons ba
      on ba.business_id = b.business_id and ba.addon_key = b.key
    where b.business_id = p_business_id and b.kind = 'addon' and b.live
      and coalesce(b.polar_created_at > ba.polar_detached_at, true)
    order by b.key, b.polar_created_at, b.polar_subscription_id
  ) a;

  return jsonb_build_object(
    'ok', true,
    'status', v_s.status,
    'billing_source', v_s.billing_source,
    'current_plan', v_s.plan,
    'trial_ends_at', v_s.trial_ends_at,
    'period_end', v_s.current_period_end,
    'has_billing_account', exists (
      select 1 from public.billing_subscriptions b where b.business_id = p_business_id
    ),
    'plan', case when v_plan.polar_subscription_id is null then null else jsonb_build_object(
      'key', v_plan.key,
      'interval', v_plan.interval,
      'seats', v_plan.seats,
      'polar_status', v_plan.polar_status,
      'cancel_at_period_end', v_plan.cancel_at_period_end,
      'current_period_start', v_plan.current_period_start,
      'current_period_end', v_plan.current_period_end,
      'past_due_until', case when v_plan.polar_status = 'past_due' then v_plan.access_until else null end
    ) end,
    'addons', v_addons
  );
end
$function$;

comment on function public.get_my_billing(uuid) is
  'Owner billing screen (settings.billing): the business''s own live Polar subscription state '
  '(primary plan + live add-ons, cancel/past-due flags, periods). Catalogue/prices come from get_public_pricing.';

revoke all on function public.get_my_billing(uuid) from public, anon;
grant execute on function public.get_my_billing(uuid) to authenticated;
