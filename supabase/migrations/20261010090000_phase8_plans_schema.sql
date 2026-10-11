-- Phase 8A (1/3): plans, add-ons, subscriptions, industry presets.
--
-- business_subscriptions is the WRITE target (only the super admin RPCs write it).
-- A trigger mirrors plan/status/trial_ends_at/plan_activated_at into `businesses`
-- so business_is_active(), can() and the client keep working unchanged.
-- Tenants and API-side super admin calls can no longer change those four columns
-- on `businesses` directly (guard below); hand SQL as postgres still can, which
-- would desync the mirror: change subscriptions instead.

-- ---------------------------------------------------------------------------
-- plans (three fixed rows: structure is migration-owned, prices are admin-owned)
-- ---------------------------------------------------------------------------
create table public.plans (
  key public.business_plan primary key,
  name text not null,
  staff_cap integer,            -- per location; null = unlimited
  max_branches integer,         -- null = unlimited
  features jsonb not null default '{}'::jsonb,
  price_monthly_minor bigint not null,
  price_annual_minor bigint not null,
  currency text not null default 'USD',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint plans_name_length check (char_length(name) between 1 and 60),
  constraint plans_staff_cap_positive check (staff_cap is null or staff_cap > 0),
  constraint plans_max_branches_positive check (max_branches is null or max_branches > 0),
  constraint plans_features_object check (jsonb_typeof(features) = 'object'),
  constraint plans_prices_nonneg check (price_monthly_minor >= 0 and price_annual_minor >= 0),
  constraint plans_currency_format check (currency ~ '^[A-Z]{3}$')
);
comment on table public.plans is
  'Solo/Team/Business. features = boolean flags read by business_has_feature(). Prices are PLACEHOLDERS edited by the super admin.';

create table public.addons (
  key text primary key,
  name text not null,
  price_monthly_minor bigint not null,
  currency text not null default 'USD',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint addons_key_format check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint addons_name_length check (char_length(name) between 1 and 60),
  constraint addons_price_nonneg check (price_monthly_minor >= 0),
  constraint addons_currency_format check (currency ~ '^[A-Z]{3}$')
);

insert into public.plans (key, name, staff_cap, max_branches, features, price_monthly_minor, price_annual_minor, sort_order) values
  ('solo', 'Solo', 1, 1,
   '{"core":true,"website":true,"reviews":true,"booking_link":true,"default_roles":false,"commission":false,"embed_widget":false,"advanced_reports":false,"custom_roles":false,"multi_branch":false,"branch_comparison":false}',
   1500, 14760, 1),
  ('team', 'Team', 5, 1,
   '{"core":true,"website":true,"reviews":true,"booking_link":true,"default_roles":true,"commission":true,"embed_widget":true,"advanced_reports":true,"custom_roles":false,"multi_branch":false,"branch_comparison":false}',
   3900, 38376, 2),
  ('business', 'Business', null, null,
   '{"core":true,"website":true,"reviews":true,"booking_link":true,"default_roles":true,"commission":true,"embed_widget":true,"advanced_reports":true,"custom_roles":true,"multi_branch":true,"branch_comparison":true}',
   7900, 77736, 3);

insert into public.addons (key, name, price_monthly_minor, sort_order) values
  ('packages', 'Packages & Sessions', 1200, 1),
  ('inventory', 'Inventory', 1000, 2),
  ('files_photos', 'Files & Photos', 800, 3),
  ('forms_consent', 'Forms & Consent', 1000, 4),
  ('client_portal', 'Client portal', 1500, 5),
  ('custom_roles', 'Custom roles & permissions', 1200, 6);

-- ---------------------------------------------------------------------------
-- business_subscriptions / business_addons
-- ---------------------------------------------------------------------------
create table public.business_subscriptions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan public.business_plan,                       -- null while on trial
  status public.business_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  assigned_by uuid references public.profiles (id) on delete set null,
  notes text,                                      -- internal: members cannot read it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_subscriptions_active_needs_plan check (status <> 'active' or plan is not null),
  constraint business_subscriptions_notes_length check (notes is null or char_length(notes) <= 1000),
  constraint business_subscriptions_period_order
    check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);
create index business_subscriptions_status_idx on public.business_subscriptions (status);
create index business_subscriptions_plan_idx on public.business_subscriptions (plan);
create index business_subscriptions_assigned_by_idx on public.business_subscriptions (assigned_by);
create trigger business_subscriptions_set_updated_at before update on public.business_subscriptions
  for each row execute function public.set_updated_at();

create table public.business_addons (
  business_id uuid not null references public.businesses (id) on delete cascade,
  addon_key text not null references public.addons (key),
  enabled boolean not null default false,
  enabled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, addon_key)
);
create index business_addons_addon_idx on public.business_addons (addon_key);
create index business_addons_enabled_by_idx on public.business_addons (enabled_by);
create trigger business_addons_set_updated_at before update on public.business_addons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- industry_presets (super admin edits; owners read at onboarding)
-- ---------------------------------------------------------------------------
create table public.industry_presets (
  key text primary key,
  name text not null,
  terminology jsonb not null default '{}'::jsonb,
  starter_custom_fields jsonb not null default '[]'::jsonb,
  template_key text not null default 'default',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint industry_presets_key_format check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint industry_presets_name_length check (char_length(name) between 1 and 80),
  constraint industry_presets_terminology_object check (jsonb_typeof(terminology) = 'object'),
  constraint industry_presets_fields_array check (jsonb_typeof(starter_custom_fields) = 'array'),
  constraint industry_presets_template_format check (template_key ~ '^[a-z0-9_]{1,40}$')
);
create trigger industry_presets_set_updated_at before update on public.industry_presets
  for each row execute function public.set_updated_at();
create index industry_presets_updated_by_idx on public.industry_presets (updated_by);
create index plans_updated_by_idx on public.plans (updated_by);
create index addons_updated_by_idx on public.addons (updated_by);

-- list_businesses paging (name search reuses the existing businesses_name_trgm_idx)
create index businesses_created_idx on public.businesses (created_at desc, id desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS + least privilege (writes are RPC-only)
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.addons enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.business_addons enable row level security;
alter table public.industry_presets enable row level security;

revoke all on public.plans, public.addons, public.business_subscriptions,
  public.business_addons, public.industry_presets from anon, authenticated, public;

create policy plans_select on public.plans for select to authenticated
  using (active or public.is_super_admin());
create policy addons_select on public.addons for select to authenticated
  using (active or public.is_super_admin());
create policy industry_presets_select on public.industry_presets for select to authenticated
  using (active or public.is_super_admin());
create policy business_subscriptions_select on public.business_subscriptions for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy business_addons_select on public.business_addons for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());

grant select on public.plans, public.addons, public.industry_presets, public.business_addons to authenticated;
-- notes and assigned_by are internal.
grant select (business_id, plan, status, trial_ends_at, current_period_start, current_period_end, created_at, updated_at)
  on public.business_subscriptions to authenticated;
grant all on public.plans, public.addons, public.business_subscriptions,
  public.business_addons, public.industry_presets to service_role;

-- ---------------------------------------------------------------------------
-- Backfill: every existing business gets a subscription mirroring its columns.
-- (All three existing businesses are `trialing`, plan null: they stay on trial,
-- i.e. Business-level with every add-on on, exactly as before.)
-- ---------------------------------------------------------------------------
insert into public.business_subscriptions (business_id, plan, status, trial_ends_at, current_period_start)
select b.id, b.plan, b.status, b.trial_ends_at, b.plan_activated_at
from public.businesses b;

-- New businesses get their subscription row from a trigger, so every creation
-- path (signup RPC, tests, hand SQL) is covered.
create or replace function public.create_business_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.business_subscriptions (business_id, plan, status, trial_ends_at, current_period_start)
  values (new.id, new.plan, new.status, new.trial_ends_at, new.plan_activated_at)
  on conflict (business_id) do nothing;
  return new;
end $$;
revoke all on function public.create_business_subscription() from public, anon, authenticated;
create trigger businesses_create_subscription after insert on public.businesses
  for each row execute function public.create_business_subscription();

-- Mirror subscription -> businesses (only when something differs, so the
-- tenant guard is never tripped by a no-op).
create or replace function public.sync_business_from_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('wapee.plan_sync', 'on', true);
  update public.businesses b
     set plan = new.plan,
         status = new.status,
         trial_ends_at = new.trial_ends_at,
         plan_activated_at = case when new.status = 'active' then new.current_period_start else b.plan_activated_at end
   where b.id = new.business_id
     and (b.plan is distinct from new.plan
          or b.status is distinct from new.status
          or b.trial_ends_at is distinct from new.trial_ends_at
          or (new.status = 'active' and b.plan_activated_at is distinct from new.current_period_start));
  perform set_config('wapee.plan_sync', 'off', true);
  return new;
end $$;
revoke all on function public.sync_business_from_subscription() from public, anon, authenticated;
create trigger business_subscriptions_sync after insert or update on public.business_subscriptions
  for each row execute function public.sync_business_from_subscription();

-- businesses.plan/status/trial_ends_at/plan_activated_at may now change only
-- through the mirror (flag) or hand SQL (auth.uid() null). An API caller,
-- even the super admin, goes through the RPCs.
create or replace function public.enforce_business_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is not null and coalesce(current_setting('wapee.plan_sync', true), 'off') <> 'on' then
    if new.plan is distinct from old.plan
       or new.status is distinct from old.status
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.plan_activated_at is distinct from old.plan_activated_at then
      raise exception 'plan, status and trial dates are managed by Wapee'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
