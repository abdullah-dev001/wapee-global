-- Phase 2, part 1: the service catalogue.
--
-- service_categories, services, service_branches (price), resources,
-- service_resources.
--
-- `service_staff` (which staff perform which service) lives in part 2 with
-- `staff_profiles`, the table it references, so each migration applies cleanly on
-- its own.
--
-- Shape decisions, and why:
--
-- * **Name, duration, category and active flag live on the SERVICE** (business
--   level). **Price lives on `service_branches`.** Currency belongs to the branch
--   (decision 23) and product doc §8.2 lists multi-branch as "own hours, staff,
--   **prices**, currency, timezone", so a price without a branch has no currency
--   and could not be shown. Currency is never stored here: it is read from
--   `branches.currency`, which cannot change once the branch has invoices.
--
-- * **No per-staff price or duration.** Product doc §6.3: "Not included:
--   multi-service bookings, recurring appointments, staff-specific
--   price/duration." One duration and one price per service per branch.
--
-- * **Categories are optional** (`services.category_id` is nullable). A barber
--   with six services should not have to invent categories; the UI groups the
--   uncategorised ones together.
--
-- * **Resources** (rooms / chairs / bays) are built now because the Build Plan
--   puts them in Phase 2, but nothing consumes them until the slot engine in
--   Phase 3. Booking settings default them off.

-- ---------------------------------------------------------------------------
-- service_categories
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  -- Manual ordering in the UI; ties break by name.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  constraint service_categories_name_length check (char_length(name) between 1 and 80)
);

comment on table public.service_categories is
  'Optional grouping for services. A service with category_id null is "Uncategorised".';

-- Two live categories in one business cannot share a name.
create unique index service_categories_unique_name
  on public.service_categories (business_id, lower(name))
  where deleted_at is null;
create index service_categories_business_idx
  on public.service_categories (business_id) where deleted_at is null;

create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Optional: null = uncategorised. Clearing a category leaves its services.
  category_id uuid references public.service_categories (id) on delete set null,
  name text not null,
  description text,
  -- One duration for everyone (doc §6.3 rules out staff-specific durations).
  duration_minutes integer not null,
  -- Minutes blocked after the appointment, on top of the duration. The slot
  -- engine (Phase 3) also applies the global buffer from booking settings.
  buffer_minutes integer not null default 0,
  -- Off = hidden from booking and from new appointments, history untouched.
  is_active boolean not null default true,
  -- Shown on the public booking page and website.
  is_bookable_online boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  constraint services_name_length check (char_length(name) between 1 and 120),
  constraint services_description_length check (description is null or char_length(description) <= 2000),
  -- 5 minutes to a full day. A longer booking is two appointments.
  constraint services_duration_range check (duration_minutes between 5 and 1440),
  constraint services_buffer_range check (buffer_minutes between 0 and 480)
);

comment on table public.services is
  'What a business sells. Duration is per service (doc §6.3); price is per branch in service_branches.';
comment on column public.services.buffer_minutes is
  'Clean-up time after this service, added to the global booking buffer.';

create unique index services_unique_name
  on public.services (business_id, lower(name)) where deleted_at is null;
create index services_business_idx on public.services (business_id) where deleted_at is null;
create index services_category_idx on public.services (category_id) where deleted_at is null;
-- Text search on the services list.
create index services_name_trgm_idx on public.services using gin (name extensions.gin_trgm_ops);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- service_branches: the price, per branch
-- ---------------------------------------------------------------------------
create table public.service_branches (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  -- Denormalised so RLS and indexes do not have to join through services.
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Minor units (pence, paisa, cents). NEVER a float (CLAUDE.md §6).
  -- Currency is read from branches.currency and is deliberately not stored here.
  price_minor bigint not null,
  -- Off = this branch does not offer the service.
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A free service is valid (consultations); a negative price is not.
  constraint service_branches_price_non_negative check (price_minor >= 0),
  constraint service_branches_unique unique (service_id, branch_id)
);

comment on table public.service_branches is
  'Price and availability of a service at one branch. Currency comes from branches.currency, never stored here (decision 23).';
comment on column public.service_branches.price_minor is
  'Integer minor units in the BRANCH currency. 1050 = 10.50 GBP at a GBP branch.';

create index service_branches_branch_idx on public.service_branches (branch_id);
create index service_branches_service_idx on public.service_branches (service_id);
create index service_branches_business_idx on public.service_branches (business_id);

create trigger service_branches_set_updated_at
  before update on public.service_branches
  for each row execute function public.set_updated_at();

-- The branch must belong to the same business as the service, or a tenant could
-- price another tenant's service. RLS checks the caller; this checks the data.
create or replace function public.enforce_service_branch_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_service_business uuid;
  v_branch_business uuid;
begin
  select business_id into v_service_business from public.services where id = new.service_id;
  select business_id into v_branch_business from public.branches where id = new.branch_id;

  if v_service_business is null or v_branch_business is null
     or v_service_business <> v_branch_business
     or new.business_id <> v_service_business then
    raise exception 'Service and branch must belong to the same business'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger service_branches_tenant_guard
  before insert or update on public.service_branches
  for each row execute function public.enforce_service_branch_tenant();

-- ---------------------------------------------------------------------------
-- resources: rooms, chairs, bays
-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- A room exists at one branch.
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null,
  -- How many appointments can use it at once. 1 = an ordinary room.
  capacity integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint resources_name_length check (char_length(name) between 1 and 80),
  constraint resources_capacity_positive check (capacity between 1 and 100)
);

comment on table public.resources is
  'Rooms / chairs / bays at a branch. Built in Phase 2; consumed by the slot engine in Phase 3 when the booking setting is on.';

create unique index resources_unique_name
  on public.resources (branch_id, lower(name)) where deleted_at is null;
create index resources_business_idx on public.resources (business_id) where deleted_at is null;
create index resources_branch_idx on public.resources (branch_id) where deleted_at is null;

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- service_resources: which resource a service needs
-- ---------------------------------------------------------------------------
create table public.service_resources (
  service_id uuid not null references public.services (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (service_id, resource_id)
);

comment on table public.service_resources is
  'A service needs one of these resources to run. Empty = needs none.';

create index service_resources_resource_idx on public.service_resources (resource_id);
create index service_resources_business_idx on public.service_resources (business_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Reads: any member of the business. Writes: `services.manage`, which also
-- refuses an inactive business because `can()` includes business_is_active().
-- Policies are split per action (not FOR ALL) so a read evaluates one policy.

alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_branches enable row level security;
alter table public.resources enable row level security;
alter table public.service_resources enable row level security;

-- service_categories
create policy service_categories_select on public.service_categories
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy service_categories_insert on public.service_categories
  for insert to authenticated
  with check (public.can(business_id, null, 'services.manage'));
create policy service_categories_update on public.service_categories
  for update to authenticated
  using (public.can(business_id, null, 'services.manage'))
  with check (public.can(business_id, null, 'services.manage'));
create policy service_categories_delete on public.service_categories
  for delete to authenticated
  using (public.can(business_id, null, 'services.manage'));

-- services
create policy services_select on public.services
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy services_insert on public.services
  for insert to authenticated
  with check (public.can(business_id, null, 'services.manage'));
create policy services_update on public.services
  for update to authenticated
  using (public.can(business_id, null, 'services.manage'))
  with check (public.can(business_id, null, 'services.manage'));
create policy services_delete on public.services
  for delete to authenticated
  using (public.can(business_id, null, 'services.manage'));

-- service_branches: scoped to the branch, so a branch-scoped manager can only
-- price their own branch.
create policy service_branches_select on public.service_branches
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy service_branches_insert on public.service_branches
  for insert to authenticated
  with check (public.can(business_id, branch_id, 'services.manage'));
create policy service_branches_update on public.service_branches
  for update to authenticated
  using (public.can(business_id, branch_id, 'services.manage'))
  with check (public.can(business_id, branch_id, 'services.manage'));
create policy service_branches_delete on public.service_branches
  for delete to authenticated
  using (public.can(business_id, branch_id, 'services.manage'));

-- resources
create policy resources_select on public.resources
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy resources_insert on public.resources
  for insert to authenticated
  with check (public.can(business_id, branch_id, 'services.manage'));
create policy resources_update on public.resources
  for update to authenticated
  using (public.can(business_id, branch_id, 'services.manage'))
  with check (public.can(business_id, branch_id, 'services.manage'));
create policy resources_delete on public.resources
  for delete to authenticated
  using (public.can(business_id, branch_id, 'services.manage'));

-- service_resources
create policy service_resources_select on public.service_resources
  for select to authenticated
  using (public.is_member(business_id) or public.is_super_admin());
create policy service_resources_insert on public.service_resources
  for insert to authenticated
  with check (public.can(business_id, null, 'services.manage'));
create policy service_resources_delete on public.service_resources
  for delete to authenticated
  using (public.can(business_id, null, 'services.manage'));

grant select, insert, update, delete on public.service_categories to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.service_branches to authenticated;
grant select, insert, update, delete on public.resources to authenticated;
grant select, insert, delete on public.service_resources to authenticated;

revoke all on function public.enforce_service_branch_tenant() from public, anon, authenticated;
