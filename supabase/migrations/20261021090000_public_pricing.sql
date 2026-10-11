-- Public pricing for the marketing landing page (/).
--
-- 1. New price fields the super admin manages in /admin/platform:
--    plans.priced_per_branch (Business is billed per location), addons.price_annual_minor (yearly add-on price),
--    addons.available_plans (null = every plan; custom_roles is sold on Team only and INCLUDED in Business, which
--    the page reads from plans.features, the same flags business_has_feature() uses).
-- 2. Launch prices (USD/month, yearly = 10 x monthly): Solo 15, Team 39, Business 79 per location; add-ons
--    Packages 9, Inventory 9, Files & Photos 9, Forms & Consent 12, Client portal 12, Custom roles 10.
-- 3. get_public_pricing(): anon, read-only, only public price fields of ACTIVE rows.
-- 4. set_plan_prices / set_addon_prices take the new fields (old positional calls keep working).
-- 5. Reserved slugs for the landing paths.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.plans add column priced_per_branch boolean not null default false;
comment on column public.plans.priced_per_branch is
  'True: the price is per location (each extra location billed the same). Display + billing note only.';

alter table public.addons add column price_annual_minor bigint;
update public.addons set price_annual_minor = price_monthly_minor * 10;
alter table public.addons alter column price_annual_minor set not null;
alter table public.addons add constraint addons_annual_price_nonneg check (price_annual_minor >= 0);

alter table public.addons add column available_plans public.business_plan[];
alter table public.addons add constraint addons_available_plans_not_empty
  check (available_plans is null or cardinality(available_plans) > 0);
comment on column public.addons.available_plans is
  'Plans the add-on can be bought on; null = every plan. A plan whose features flag the same key includes it.';

-- ---------------------------------------------------------------------------
-- 2. Launch prices
-- ---------------------------------------------------------------------------
update public.plans set price_monthly_minor = 1500, price_annual_minor = 15000 where key = 'solo';
update public.plans set price_monthly_minor = 3900, price_annual_minor = 39000 where key = 'team';
update public.plans set price_monthly_minor = 7900, price_annual_minor = 79000, priced_per_branch = true
 where key = 'business';

update public.addons a
   set price_monthly_minor = v.monthly, price_annual_minor = v.monthly * 10
  from (values ('packages', 900), ('inventory', 900), ('files_photos', 900),
               ('forms_consent', 1200), ('client_portal', 1200), ('custom_roles', 1000)) as v(key, monthly)
 where a.key = v.key;
update public.addons set available_plans = array['team']::public.business_plan[] where key = 'custom_roles';

-- ---------------------------------------------------------------------------
-- 3. Public read
-- ---------------------------------------------------------------------------
create or replace function public.get_public_pricing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', p.key, 'name', p.name, 'staff_cap', p.staff_cap, 'max_branches', p.max_branches,
               'priced_per_branch', p.priced_per_branch, 'features', p.features,
               'price_monthly_minor', p.price_monthly_minor, 'price_annual_minor', p.price_annual_minor,
               'currency', p.currency)
             order by p.sort_order, p.key)
        from public.plans p where p.active), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', a.key, 'name', a.name, 'available_plans', to_jsonb(a.available_plans),
               'price_monthly_minor', a.price_monthly_minor, 'price_annual_minor', a.price_annual_minor,
               'currency', a.currency)
             order by a.sort_order, a.key)
        from public.addons a where a.active), '[]'::jsonb))
$$;
comment on function public.get_public_pricing() is
  'Landing page prices. Public, read-only, active rows and public fields only (no updated_by, no internal flags).';
revoke all on function public.get_public_pricing() from public;
grant execute on function public.get_public_pricing() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Admin writes (new trailing params; null = keep the current value)
-- ---------------------------------------------------------------------------
drop function public.set_plan_prices(text, bigint, bigint, text, text, boolean);
create function public.set_plan_prices(
  p_key text, p_monthly_minor bigint, p_annual_minor bigint, p_currency text,
  p_name text default null, p_active boolean default null, p_priced_per_branch boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_old record;
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_monthly_minor is null or p_annual_minor is null or p_monthly_minor < 0 or p_annual_minor < 0
     or p_monthly_minor > 100000000 or p_annual_minor > 1000000000
     or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or (p_name is not null and char_length(btrim(p_name)) not between 1 and 60) then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  select * into v_old from public.plans where key::text = p_key for update;
  if v_old.key is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  update public.plans
     set price_monthly_minor = p_monthly_minor, price_annual_minor = p_annual_minor, currency = p_currency,
         name = coalesce(btrim(p_name), name), active = coalesce(p_active, active),
         priced_per_branch = coalesce(p_priced_per_branch, priced_per_branch), updated_by = (select auth.uid())
   where key = v_old.key;

  perform public.write_audit_log(null, 'admin.set_plan_prices', 'plan', p_key,
    jsonb_build_object('monthly', v_old.price_monthly_minor, 'annual', v_old.price_annual_minor,
                       'currency', v_old.currency, 'active', v_old.active,
                       'priced_per_branch', v_old.priced_per_branch),
    jsonb_build_object('monthly', p_monthly_minor, 'annual', p_annual_minor, 'currency', p_currency,
                       'active', coalesce(p_active, v_old.active),
                       'priced_per_branch', coalesce(p_priced_per_branch, v_old.priced_per_branch)));
  return jsonb_build_object('ok', true);
end $$;

-- p_available_plans: null = keep, '{}' = every plan, otherwise the plan keys it can be bought on.
drop function public.set_addon_prices(text, bigint, text, text, boolean);
create function public.set_addon_prices(
  p_key text, p_monthly_minor bigint, p_currency text, p_name text default null, p_active boolean default null,
  p_annual_minor bigint default null, p_available_plans text[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.admin_gate();
  v_old record;
  v_plans public.business_plan[];
begin
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  if p_monthly_minor is null or p_monthly_minor < 0 or p_monthly_minor > 100000000
     or (p_annual_minor is not null and (p_annual_minor < 0 or p_annual_minor > 1000000000))
     or p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or (p_name is not null and char_length(btrim(p_name)) not between 1 and 60)
     or (p_available_plans is not null and (array_position(p_available_plans, null) is not null
         or not p_available_plans <@ array['solo', 'team', 'business'])) then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  select * into v_old from public.addons where key = p_key for update;
  if v_old.key is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  v_plans := case
    when p_available_plans is null then v_old.available_plans
    when cardinality(p_available_plans) = 0 then null
    else (select array_agg(distinct x::public.business_plan order by x::public.business_plan)
            from unnest(p_available_plans) x) end;

  update public.addons
     set price_monthly_minor = p_monthly_minor, currency = p_currency,
         price_annual_minor = coalesce(p_annual_minor, price_annual_minor), available_plans = v_plans,
         name = coalesce(btrim(p_name), name), active = coalesce(p_active, active), updated_by = (select auth.uid())
   where key = p_key;

  perform public.write_audit_log(null, 'admin.set_addon_prices', 'addon', p_key,
    jsonb_build_object('monthly', v_old.price_monthly_minor, 'annual', v_old.price_annual_minor,
                       'currency', v_old.currency, 'active', v_old.active,
                       'available_plans', to_jsonb(v_old.available_plans)),
    jsonb_build_object('monthly', p_monthly_minor, 'annual', coalesce(p_annual_minor, v_old.price_annual_minor),
                       'currency', p_currency, 'active', coalesce(p_active, v_old.active),
                       'available_plans', to_jsonb(v_plans)));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.set_plan_prices(text, bigint, bigint, text, text, boolean, boolean) from public, anon;
grant execute on function public.set_plan_prices(text, bigint, bigint, text, text, boolean, boolean) to authenticated;
revoke all on function public.set_addon_prices(text, bigint, text, text, boolean, bigint, text[]) from public, anon;
grant execute on function public.set_addon_prices(text, bigint, text, text, boolean, bigint, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Landing paths can never be a business slug
-- ---------------------------------------------------------------------------
insert into public.reserved_slugs (slug) values ('pricing'), ('features'), ('refund')
on conflict do nothing;
