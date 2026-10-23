-- Subscription billing through Polar (Merchant of Record), part 1: storage and the super admin
-- override. Founder's plan approved 2026-10-23: plans AND add-ons are fully automatic (one
-- Polar subscription for the plan, one small subscription per add-on); manual billing stays
-- only as a super admin support override.
--
-- Shape:
--   * billing_products        Polar product id -> (plan | addon, key, month | year). No prices:
--                              prices stay in plans / addons (get_public_pricing).
--   * billing_subscriptions   one row per Polar subscription, the last snapshot we applied.
--                              The ONLY Polar state we keep; written by billing_apply_subscription
--                              (20261027110000) through service_role only.
--   * billing_webhook_events  one row per webhook delivery id (dedupe + replay safety). No
--                              payload is stored: the handler re-reads the subscription from Polar.
--   * business_subscriptions  + billing_source ('manual' | 'polar'), polar_detached_at.
--   * business_addons         + source, access_until (paid add-on access ends here), polar_detached_at.
--
-- Override: assign_plan / set_addon (super admin) now DETACH that plan / add-on from Polar
-- (source 'manual', polar_detached_at = now()). Polar subscriptions created before the detach
-- time never drive it again; a new subscription the owner starts afterwards attaches again.
-- set_billing_source() switches explicitly.
--
-- Feature and limit changes:
--   * business_has_feature: a paid add-on counts only while access_until is null or in the future.
--   * business_plan_limits: a Business plan billed by Polar has max_branches = its paid seats
--     (seat = location), so a location beyond the paid seats is refused (branch_limit_reached).

-- ---------------------------------------------------------------------------
-- billing_products
-- ---------------------------------------------------------------------------
create table public.billing_products (
  polar_product_id text primary key check (char_length(polar_product_id) between 1 and 100),
  kind text not null check (kind in ('plan', 'addon')),
  key text not null check (char_length(key) between 1 and 40),
  interval text not null check (interval in ('month', 'year')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
comment on table public.billing_products is
  'Polar product id -> Wapee plan or add-on and interval. No prices here (they live in plans / addons). One ACTIVE product per kind/key/interval. Written only by set_billing_product (super admin).';
create unique index billing_products_one_active_idx on public.billing_products (kind, key, interval) where active;
create index billing_products_updated_by_idx on public.billing_products (updated_by);
create trigger billing_products_set_updated_at before update on public.billing_products
  for each row execute function public.set_updated_at();
alter table public.billing_products enable row level security;
revoke all on table public.billing_products from anon, authenticated;
grant select on table public.billing_products to authenticated;
create policy billing_products_select on public.billing_products for select to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- billing_subscriptions
-- ---------------------------------------------------------------------------
create table public.billing_subscriptions (
  polar_subscription_id text primary key check (char_length(polar_subscription_id) between 1 and 100),
  business_id uuid not null references public.businesses (id) on delete cascade,
  polar_customer_id text not null check (char_length(polar_customer_id) between 1 and 100),
  polar_product_id text not null check (char_length(polar_product_id) between 1 and 100),
  kind text not null check (kind in ('plan', 'addon')),
  key text not null check (char_length(key) between 1 and 40),
  interval text not null check (interval in ('month', 'year')),
  polar_status text not null check (polar_status in
    ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  seats integer check (seats is null or seats between 1 and 1000),
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  ended_at timestamptz,
  past_due_since timestamptz,
  -- Derived when applied: does this subscription give access, and until when.
  live boolean not null,
  access_until timestamptz,
  -- Why WE cancelled / revoked it automatically (null = not us).
  followup text check (followup in ('plan_cancel', 'plan_change', 'plan_ended', 'duplicate')),
  polar_created_at timestamptz not null,
  polar_modified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.billing_subscriptions is
  'Last applied snapshot of each Polar subscription (plan or add-on) of a business. Written only by the billing functions (service_role); owners read it through my_billing(). RLS on, no policy, no API grant.';
create index billing_subscriptions_business_idx on public.billing_subscriptions (business_id, kind, key);
create index billing_subscriptions_live_idx on public.billing_subscriptions (business_id) where live;
create trigger billing_subscriptions_set_updated_at before update on public.billing_subscriptions
  for each row execute function public.set_updated_at();
alter table public.billing_subscriptions enable row level security;
revoke all on table public.billing_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- billing_webhook_events
-- ---------------------------------------------------------------------------
create table public.billing_webhook_events (
  webhook_id text primary key check (char_length(webhook_id) between 1 and 200),
  event_type text not null check (char_length(event_type) between 1 and 80),
  polar_subscription_id text check (polar_subscription_id is null or char_length(polar_subscription_id) <= 100),
  business_id uuid references public.businesses (id) on delete set null,
  attempts integer not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text check (result is null or char_length(result) <= 80),
  error text check (error is null or char_length(error) <= 300)
);
comment on table public.billing_webhook_events is
  'One row per Polar webhook delivery id: dedupe and replay safety. No payload (the handler re-reads the subscription from Polar). Deleted after 90 days. RLS on, no policy, no API grant.';
create index billing_webhook_events_received_idx on public.billing_webhook_events (received_at);
create index billing_webhook_events_business_idx on public.billing_webhook_events (business_id);
alter table public.billing_webhook_events enable row level security;
revoke all on table public.billing_webhook_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Existing tables
-- ---------------------------------------------------------------------------
alter table public.business_subscriptions
  add column billing_source text not null default 'manual' check (billing_source in ('manual', 'polar')),
  add column polar_detached_at timestamptz;
comment on column public.business_subscriptions.billing_source is
  '''polar'': plan, status and current_period_end follow the Polar plan subscription. ''manual'': the super admin sets them (also the default for every new business, trial included).';
comment on column public.business_subscriptions.polar_detached_at is
  'Set when a super admin took the plan off Polar. Polar subscriptions created before this never drive it again.';
-- Members read business_subscriptions through column grants (notes / assigned_by hidden); the
-- new columns are NOT granted: owners read them through my_billing().

alter table public.business_addons
  add column source text not null default 'manual' check (source in ('manual', 'polar')),
  add column access_until timestamptz,
  add column polar_detached_at timestamptz;
comment on column public.business_addons.access_until is
  'A Polar-paid add-on counts only until this time (period end, plus the grace after a failed payment). Null = no end (manual).';

-- ---------------------------------------------------------------------------
-- Features and limits
-- ---------------------------------------------------------------------------
create or replace function public.business_has_feature(p_business_id uuid, p_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_s record;
  v_plan text;
begin
  if p_business_id is null or p_key is null then return false; end if;
  if not public.business_is_active(p_business_id) then return false; end if;
  select s.status, s.plan into v_s from public.business_subscriptions s where s.business_id = p_business_id;
  if not found then return false; end if;
  v_plan := case when v_s.status = 'trialing' then 'business' else v_s.plan::text end;
  if v_plan is null then return false; end if;
  if coalesce((select (p.features ->> p_key)::boolean from public.plans p where p.key = v_plan::public.business_plan), false) then
    return true;
  end if;
  if exists (select 1 from public.addons a where a.key = p_key) then
    return v_s.status = 'trialing'
        or exists (select 1 from public.business_addons ba
                   where ba.business_id = p_business_id and ba.addon_key = p_key and ba.enabled
                     and (ba.access_until is null or ba.access_until > now()));
  end if;
  return false;
end $$;

-- Paid locations of a Polar-billed Business plan: the seats of its live plan subscription
-- (the earliest-created live one, the same rule billing_apply_subscription uses). Null when the
-- plan is not Polar-billed.
create or replace function public.billing_paid_seats(p_business_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select bsub.seats
  from public.business_subscriptions s
  join public.billing_subscriptions bsub
    on bsub.business_id = s.business_id and bsub.kind = 'plan' and bsub.live
   and (s.polar_detached_at is null or bsub.polar_created_at > s.polar_detached_at)
  where s.business_id = p_business_id and s.billing_source = 'polar'
  order by bsub.polar_created_at, bsub.polar_subscription_id
  limit 1
$$;
revoke all on function public.billing_paid_seats(uuid) from public, anon, authenticated;

create or replace function public.business_plan_limits(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_s record;
  v_plan text;
  v_p record;
  v_max integer;
begin
  select s.status, s.plan into v_s from public.business_subscriptions s where s.business_id = p_business_id;
  if not found then return null; end if;
  v_plan := case when v_s.status = 'trialing' then 'business' else v_s.plan::text end;
  if v_plan is null then
    return jsonb_build_object('plan', null, 'status', v_s.status, 'trial', false, 'staff_cap', null, 'max_branches', null);
  end if;
  select p.staff_cap, p.max_branches, p.priced_per_branch into v_p from public.plans p where p.key = v_plan::public.business_plan;
  v_max := v_p.max_branches;
  -- A per-location plan paid through Polar: as many locations as paid seats.
  if v_s.status <> 'trialing' and v_p.priced_per_branch then
    v_max := coalesce(public.billing_paid_seats(p_business_id), v_max);
  end if;
  return jsonb_build_object('plan', v_plan, 'status', v_s.status, 'trial', v_s.status = 'trialing',
                            'staff_cap', v_p.staff_cap, 'max_branches', v_max);
end $$;

-- ---------------------------------------------------------------------------
-- Super admin: product mapping, billing source, and the overrides that detach
-- ---------------------------------------------------------------------------
create or replace function public.set_billing_product(
  p_product_id text, p_kind text, p_key text, p_interval text, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_before jsonb;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_product_id is null or char_length(btrim(p_product_id)) not between 1 and 100
     or p_kind is null or p_kind not in ('plan', 'addon')
     or p_interval is null or p_interval not in ('month', 'year')
     or p_active is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if (p_kind = 'plan' and not exists (select 1 from public.plans p where p.key::text = p_key))
     or (p_kind = 'addon' and not exists (select 1 from public.addons a where a.key = p_key)) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  select to_jsonb(bp) - 'created_at' - 'updated_at' - 'updated_by' into v_before
  from public.billing_products bp where bp.polar_product_id = btrim(p_product_id);
  if v_before is not null and (v_before ->> 'kind' <> p_kind or v_before ->> 'key' <> p_key) then
    -- A product id always means the same thing: existing subscriptions point at it.
    return jsonb_build_object('ok', false, 'code', 'product_in_use');
  end if;
  if p_active and exists (select 1 from public.billing_products bp
                          where bp.kind = p_kind and bp.key = p_key and bp.interval = p_interval and bp.active
                            and bp.polar_product_id <> btrim(p_product_id)) then
    return jsonb_build_object('ok', false, 'code', 'duplicate_product');
  end if;

  insert into public.billing_products (polar_product_id, kind, key, interval, active, updated_by)
  values (btrim(p_product_id), p_kind, p_key, p_interval, p_active, (select auth.uid()))
  on conflict (polar_product_id) do update
    set interval = excluded.interval, active = excluded.active, updated_by = excluded.updated_by;

  perform public.write_audit_log(null, 'admin.set_billing_product', 'billing_product', btrim(p_product_id),
    v_before, jsonb_build_object('kind', p_kind, 'key', p_key, 'interval', p_interval, 'active', p_active));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_billing_product(text, text, text, text, boolean) from public, anon;
grant execute on function public.set_billing_product(text, text, text, text, boolean) to authenticated;

-- 'manual': take the plan off Polar now (the super admin then manages it; cancel the Polar
-- subscription in Polar too, or it keeps charging). 'polar': follow Polar again; the next
-- applied subscription event (or the reconcile run) sets the plan.
create or replace function public.set_billing_source(p_business_id uuid, p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_s record;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_source is null or p_source not in ('manual', 'polar') then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  select s.billing_source, s.polar_detached_at into v_s
  from public.business_subscriptions s
  join public.businesses b on b.id = s.business_id and b.deleted_at is null
  where s.business_id = p_business_id for update of s;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_s.billing_source = p_source then return jsonb_build_object('ok', true, 'changed', false); end if;

  update public.business_subscriptions
     set billing_source = p_source,
         polar_detached_at = case when p_source = 'manual' then now() else null end
   where business_id = p_business_id;

  perform public.write_audit_log(p_business_id, 'admin.set_billing_source', 'business', p_business_id::text,
    jsonb_build_object('billing_source', v_s.billing_source), jsonb_build_object('billing_source', p_source));
  return jsonb_build_object('ok', true, 'changed', true);
end $$;
revoke all on function public.set_billing_source(uuid, text) from public, anon;
grant execute on function public.set_billing_source(uuid, text) to authenticated;

-- assign_plan: unchanged except that it detaches the plan from Polar (a super admin override).
create or replace function public.assign_plan(
  p_business_id uuid, p_plan text, p_period_end timestamptz default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_s record;
  v_viol jsonb;
  v_status public.business_status;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_plan is null or not exists (select 1 from public.plans p where p.key::text = p_plan and p.active) then
    return jsonb_build_object('ok', false, 'code', 'invalid_plan');
  end if;
  if p_period_end is not null and p_period_end <= now() then
    return jsonb_build_object('ok', false, 'code', 'invalid_period');
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_notes');
  end if;
  select s.* into v_s from public.business_subscriptions s
  join public.businesses b on b.id = s.business_id and b.deleted_at is null
  where s.business_id = p_business_id for update of s;
  if v_s.business_id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_viol := public.plan_limit_violations(p_business_id, p_plan::public.business_plan);
  if (v_viol ->> 'violated')::boolean then
    return jsonb_build_object('ok', false, 'code', 'over_limit',
      'staff_over_cap', v_viol -> 'staff_over_cap', 'branches_over', v_viol -> 'branches_over');
  end if;
  v_status := case when v_s.status = 'suspended' then 'suspended' else 'active' end;

  update public.business_subscriptions
     set plan = p_plan::public.business_plan, status = v_status,
         current_period_start = now(), current_period_end = p_period_end,
         assigned_by = (select auth.uid()), notes = coalesce(p_notes, notes),
         billing_source = 'manual',
         polar_detached_at = case when v_s.billing_source = 'polar' then now() else v_s.polar_detached_at end
   where business_id = p_business_id;

  perform public.write_audit_log(p_business_id, 'admin.assign_plan', 'business', p_business_id::text,
    jsonb_build_object('plan', v_s.plan, 'status', v_s.status, 'billing_source', v_s.billing_source),
    jsonb_build_object('plan', p_plan, 'status', v_status, 'period_end', p_period_end, 'billing_source', 'manual'));
  return jsonb_build_object('ok', true, 'plan', p_plan, 'status', v_status);
end $$;

-- set_addon: unchanged except that it detaches the add-on from Polar and clears a paid end.
create or replace function public.set_addon(p_business_id uuid, p_addon text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_was record;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_enabled is null then return jsonb_build_object('ok', false, 'code', 'invalid_input'); end if;
  if not exists (select 1 from public.addons a where a.key = p_addon) then
    return jsonb_build_object('ok', false, 'code', 'unknown_addon');
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  select ba.enabled, ba.source, ba.polar_detached_at into v_was from public.business_addons ba
   where ba.business_id = p_business_id and ba.addon_key = p_addon;

  insert into public.business_addons (business_id, addon_key, enabled, enabled_by, source, access_until, polar_detached_at)
  values (p_business_id, p_addon, p_enabled, (select auth.uid()), 'manual', null, null)
  on conflict (business_id, addon_key) do update
    set enabled = excluded.enabled, enabled_by = excluded.enabled_by,
        source = 'manual', access_until = null,
        polar_detached_at = case when public.business_addons.source = 'polar' then now()
                                 else public.business_addons.polar_detached_at end;

  perform public.write_audit_log(p_business_id, 'admin.set_addon', 'addon', p_addon,
    jsonb_build_object('enabled', coalesce(v_was.enabled, false), 'source', coalesce(v_was.source, 'manual')),
    jsonb_build_object('enabled', p_enabled, 'source', 'manual'));
  return jsonb_build_object('ok', true, 'addon', p_addon, 'enabled', p_enabled);
end $$;
