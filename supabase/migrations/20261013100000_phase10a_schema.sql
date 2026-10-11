-- Phase 10A (1/4): schema for the add-ons "Packages & Sessions" and "Inventory".
--
-- Decided with the user (2026-10-07):
--   * a package is sold as an INVOICE LINE; the client_package is created when the invoice is ISSUED
--   * products are sold as invoice lines; stock drops at ISSUE; the credit note that exhausts the
--     invoice net restores every product line; a partial credit note restores nothing
--   * packages and products belong to ONE branch (price in that branch's currency, stock per branch)
--   * negative stock is refused unless the branch setting says otherwise
--
-- Everything here is written ONLY by SECURITY DEFINER RPCs (migrations 2-3); `authenticated` has
-- SELECT through RLS and nothing else. Every record is append-only / immutable except the
-- definitions (packages, products), which are soft-deleted.

create type public.session_usage_kind as enum ('deduct', 'reversal');
create type public.stock_movement_kind as enum ('purchase', 'adjustment', 'sale', 'return');

-- ---------------------------------------------------------------------------
-- Read gates used by the policies. They live in DEFINER functions because
-- business_has_feature() is not executable by `authenticated`.
-- ---------------------------------------------------------------------------
create or replace function public.addon_read_access(
  p_business_id uuid, p_branch_id uuid, p_feature text, p_permissions text[]
) returns boolean language sql stable security definer set search_path = '' as $$
  select public.business_has_feature(p_business_id, p_feature)
     and exists (
       select 1 from unnest(p_permissions) as perm
       where public.can(p_business_id, p_branch_id, perm)
         and public.has_permission_at_branch_scope(p_business_id, p_branch_id, perm))
$$;
revoke all on function public.addon_read_access(uuid, uuid, text, text[]) from public, anon;
grant execute on function public.addon_read_access(uuid, uuid, text, text[]) to authenticated;

-- A client's packages are visible to someone holding a packages permission at the SALE branch, at a
-- branch where the client has an appointment, or (Own scope) to the staff member who has an
-- appointment with that client.
create or replace function public.package_visible(p_business_id uuid, p_branch_id uuid, p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.business_has_feature(p_business_id, 'packages')
     and (
       public.addon_read_access(p_business_id, p_branch_id, 'packages',
         array['packages.sell', 'packages.deduct_session', 'packages.reverse_session'])
       or exists (
         select 1 from public.appointments a
         where a.client_id = p_client_id and a.business_id = p_business_id and a.deleted_at is null
           and public.addon_read_access(p_business_id, a.branch_id, 'packages',
                 array['packages.sell', 'packages.deduct_session', 'packages.reverse_session']))
       or (public.can(p_business_id, null, 'packages.deduct_session')
           and exists (
             select 1 from public.appointments a
             where a.client_id = p_client_id and a.business_id = p_business_id and a.deleted_at is null
               and a.staff_id is not null and public.is_own_staff_profile(a.staff_id)))
     )
$$;
revoke all on function public.package_visible(uuid, uuid, uuid) from public, anon;
grant execute on function public.package_visible(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- packages (definitions) + the services each one may be used for
-- ---------------------------------------------------------------------------
create table public.packages (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  branch_id      uuid not null references public.branches (id),
  name           text not null,
  description    text,
  sessions       integer not null,
  bonus_sessions integer not null default 0,
  price_minor    bigint not null,
  currency       text not null,
  expiry_days    integer,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  created_by     uuid references auth.users (id),
  constraint packages_name check (char_length(btrim(name)) between 1 and 120),
  constraint packages_sessions check (sessions between 1 and 999),
  constraint packages_bonus check (bonus_sessions between 0 and 999),
  constraint packages_price check (price_minor between 0 and 100000000000),
  constraint packages_expiry check (expiry_days is null or expiry_days between 1 and 3650)
);
create unique index packages_branch_name_uidx on public.packages (branch_id, lower(btrim(name))) where deleted_at is null;
create index packages_business_idx on public.packages (business_id);
create index packages_branch_idx on public.packages (branch_id, is_active) where deleted_at is null;
create index packages_created_by_idx on public.packages (created_by) where created_by is not null;
create trigger packages_set_updated_at before update on public.packages
  for each row execute function public.set_updated_at();

create table public.package_services (
  package_id  uuid not null references public.packages (id) on delete cascade,
  service_id  uuid not null references public.services (id),
  business_id uuid not null references public.businesses (id) on delete cascade,
  primary key (package_id, service_id)
);
create index package_services_service_idx on public.package_services (service_id);
create index package_services_business_idx on public.package_services (business_id);

-- ---------------------------------------------------------------------------
-- client_packages: one row per package SOLD. A snapshot of the definition at the
-- moment of issue (later edits never change what the client bought). Immutable.
-- ---------------------------------------------------------------------------
create table public.client_packages (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  branch_id          uuid not null references public.branches (id),
  client_id          uuid not null references public.clients (id),
  package_id         uuid references public.packages (id),
  invoice_id         uuid not null references public.invoices (id),
  invoice_item_id    uuid not null references public.invoice_items (id),
  name               text not null,
  sessions_purchased integer not null,
  sessions_bonus     integer not null default 0,
  price_minor        bigint not null,
  currency           text not null,
  sold_at            timestamptz not null,
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  constraint client_packages_sessions check (sessions_purchased between 1 and 999 and sessions_bonus between 0 and 999),
  constraint client_packages_item_uidx unique (invoice_item_id)
);
create index client_packages_business_idx on public.client_packages (business_id);
create index client_packages_branch_idx on public.client_packages (branch_id);
create index client_packages_client_idx on public.client_packages (client_id, sold_at desc);
create index client_packages_package_idx on public.client_packages (package_id) where package_id is not null;
create index client_packages_invoice_idx on public.client_packages (invoice_id);
create index client_packages_created_by_idx on public.client_packages (created_by) where created_by is not null;

create table public.client_package_services (
  client_package_id uuid not null references public.client_packages (id) on delete cascade,
  service_id        uuid not null references public.services (id),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  primary key (client_package_id, service_id)
);
create index client_package_services_service_idx on public.client_package_services (service_id);
create index client_package_services_business_idx on public.client_package_services (business_id);

-- A package whose invoice was fully credited and had no session used is CANCELLED by a
-- new row here (never by editing client_packages).
create table public.client_package_cancellations (
  client_package_id uuid primary key references public.client_packages (id) on delete cascade,
  business_id       uuid not null references public.businesses (id) on delete cascade,
  credit_note_id    uuid not null references public.credit_notes (id),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id)
);
create index client_package_cancellations_business_idx on public.client_package_cancellations (business_id);
create index client_package_cancellations_cn_idx on public.client_package_cancellations (credit_note_id);

-- ---------------------------------------------------------------------------
-- session_usages: every deduction and every reversal, forever.
-- ---------------------------------------------------------------------------
create table public.session_usages (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  branch_id         uuid not null references public.branches (id),
  client_package_id uuid not null references public.client_packages (id),
  kind              public.session_usage_kind not null,
  appointment_id    uuid references public.appointments (id),
  service_id        uuid references public.services (id),
  reverses_usage_id uuid references public.session_usages (id),
  reason            text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  constraint session_usages_shape check (
    (kind = 'deduct' and reverses_usage_id is null and appointment_id is not null)
    or (kind = 'reversal' and reverses_usage_id is not null)),
  constraint session_usages_reason check (reason is null or char_length(btrim(reason)) between 3 and 500)
);
-- a usage can be reversed once
create unique index session_usages_reverses_uidx on public.session_usages (reverses_usage_id) where reverses_usage_id is not null;
create index session_usages_business_idx on public.session_usages (business_id);
create index session_usages_branch_idx on public.session_usages (branch_id);
create index session_usages_package_idx on public.session_usages (client_package_id, created_at);
create index session_usages_appointment_idx on public.session_usages (appointment_id) where appointment_id is not null;
create index session_usages_service_idx on public.session_usages (service_id) where service_id is not null;
create index session_usages_created_by_idx on public.session_usages (created_by) where created_by is not null;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  branch_id           uuid not null references public.branches (id),
  name                text not null,
  sku                 text,
  unit                text not null default 'piece',
  price_minor         bigint not null default 0,
  currency            text not null,
  stock_qty           integer not null default 0,
  low_stock_threshold integer,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  created_by          uuid references auth.users (id),
  constraint products_name check (char_length(btrim(name)) between 1 and 120),
  constraint products_sku check (sku is null or char_length(btrim(sku)) between 1 and 60),
  constraint products_unit check (char_length(btrim(unit)) between 1 and 20),
  constraint products_price check (price_minor between 0 and 100000000000),
  constraint products_threshold check (low_stock_threshold is null or low_stock_threshold between 0 and 1000000)
);
create unique index products_branch_sku_uidx on public.products (branch_id, lower(btrim(sku))) where deleted_at is null and sku is not null;
create index products_business_idx on public.products (business_id);
create index products_branch_idx on public.products (branch_id, is_active) where deleted_at is null;
create index products_created_by_idx on public.products (created_by) where created_by is not null;
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.inventory_settings (
  branch_id            uuid primary key references public.branches (id) on delete cascade,
  business_id          uuid not null references public.businesses (id) on delete cascade,
  allow_negative_stock boolean not null default false,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id)
);
create index inventory_settings_business_idx on public.inventory_settings (business_id);
create index inventory_settings_updated_by_idx on public.inventory_settings (updated_by) where updated_by is not null;

create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  branch_id       uuid not null references public.branches (id),
  product_id      uuid not null references public.products (id),
  kind            public.stock_movement_kind not null,
  quantity        integer not null,
  stock_after     integer not null,
  reason          text,
  invoice_id      uuid references public.invoices (id),
  invoice_item_id uuid references public.invoice_items (id),
  credit_note_id  uuid references public.credit_notes (id),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  constraint stock_movements_sign check (
    (kind = 'purchase' and quantity > 0) or (kind = 'return' and quantity > 0)
    or (kind = 'sale' and quantity < 0) or (kind = 'adjustment' and quantity <> 0)),
  constraint stock_movements_qty_range check (quantity between -1000000 and 1000000),
  constraint stock_movements_reason check (reason is null or char_length(btrim(reason)) between 3 and 500),
  constraint stock_movements_adjust_reason check (kind <> 'adjustment' or reason is not null)
);
-- one sale movement per invoice line, one automatic return per (credit note, line)
create unique index stock_movements_sale_uidx on public.stock_movements (invoice_item_id) where kind = 'sale';
create unique index stock_movements_return_uidx on public.stock_movements (invoice_item_id, credit_note_id)
  where kind = 'return' and credit_note_id is not null;
create index stock_movements_business_idx on public.stock_movements (business_id);
create index stock_movements_branch_idx on public.stock_movements (branch_id);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_invoice_idx on public.stock_movements (invoice_id) where invoice_id is not null;
create index stock_movements_credit_note_idx on public.stock_movements (credit_note_id) where credit_note_id is not null;
create index stock_movements_created_by_idx on public.stock_movements (created_by) where created_by is not null;

-- invoice lines can now point at a package or a product (at most one of service / package / product)
alter table public.invoice_items
  add column package_id uuid references public.packages (id),
  add column product_id uuid references public.products (id),
  add constraint invoice_items_one_source check (num_nonnulls(service_id, package_id, product_id) <= 1);
create index invoice_items_package_idx on public.invoice_items (package_id) where package_id is not null;
create index invoice_items_product_idx on public.invoice_items (product_id) where product_id is not null;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
-- Append-only ledgers: no update, no delete (released when the BUSINESS is deleted, the cascade trap).
create or replace function public.enforce_addon_ledger_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return old;
    end if;
    raise exception '% rows are append-only and cannot be deleted', tg_table_name using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    raise exception '% rows are append-only and cannot be changed', tg_table_name using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.enforce_addon_ledger_guard() from public, anon, authenticated;

create trigger client_packages_guard before update or delete on public.client_packages
  for each row execute function public.enforce_addon_ledger_guard();
create trigger client_package_services_guard before update or delete on public.client_package_services
  for each row execute function public.enforce_addon_ledger_guard();
create trigger client_package_cancellations_guard before update or delete on public.client_package_cancellations
  for each row execute function public.enforce_addon_ledger_guard();
create trigger session_usages_guard before update or delete on public.session_usages
  for each row execute function public.enforce_addon_ledger_guard();
create trigger stock_movements_guard before update or delete on public.stock_movements
  for each row execute function public.enforce_addon_ledger_guard();

-- client_package_services rows are deleted by the cascade from client_packages when a BUSINESS goes,
-- and are otherwise untouchable (the guard above checks the business). The cascade from
-- client_packages alone cannot happen: client_packages itself is undeletable.

-- products.stock_qty moves only through a stock movement (flag set by the trigger below).
create or replace function public.enforce_product_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.stock_qty <> 0 then
      raise exception 'A product starts at zero stock; add stock with a movement' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.stock_qty is distinct from old.stock_qty
     and coalesce(current_setting('wapee.stock', true), '') <> 'on' then
    raise exception 'Stock changes only through a stock movement' using errcode = '42501';
  end if;
  if new.business_id is distinct from old.business_id or new.branch_id is distinct from old.branch_id
     or new.currency is distinct from old.currency then
    raise exception 'A product cannot move between businesses/branches or change currency' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.enforce_product_guard() from public, anon, authenticated;
create trigger products_guard before insert or update on public.products
  for each row execute function public.enforce_product_guard();

-- Applies a movement to its product under the product row lock: refuses below zero unless the
-- branch allows it, and records the resulting stock on the movement. (Migration 4 extends this with
-- the low-stock alert.)
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_after integer;
  v_allow boolean;
begin
  select p.id, p.business_id, p.branch_id, p.stock_qty, p.deleted_at into v_p
  from public.products p where p.id = new.product_id for update;
  if v_p.id is null or v_p.business_id <> new.business_id or v_p.branch_id <> new.branch_id then
    raise exception 'Stock movement does not match its product' using errcode = '23514';
  end if;
  v_after := v_p.stock_qty + new.quantity;
  select coalesce((select s.allow_negative_stock from public.inventory_settings s where s.branch_id = new.branch_id), false)
    into v_allow;
  if v_after < 0 and new.quantity < 0 and not v_allow then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;
  new.stock_after := v_after;
  perform set_config('wapee.stock', 'on', true);
  update public.products set stock_qty = v_after where id = new.product_id;
  perform set_config('wapee.stock', 'off', true);
  return new;
end $$;
revoke all on function public.apply_stock_movement() from public, anon, authenticated;
create trigger stock_movements_apply before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ---------------------------------------------------------------------------
-- RLS: SELECT only, gated by the add-on and the permission. No write policies at all.
-- ---------------------------------------------------------------------------
alter table public.packages enable row level security;
alter table public.package_services enable row level security;
alter table public.client_packages enable row level security;
alter table public.client_package_services enable row level security;
alter table public.client_package_cancellations enable row level security;
alter table public.session_usages enable row level security;
alter table public.products enable row level security;
alter table public.inventory_settings enable row level security;
alter table public.stock_movements enable row level security;

create policy packages_select on public.packages for select to authenticated
  using (public.is_super_admin() or public.addon_read_access(business_id, branch_id, 'packages', array['packages.sell', 'services.manage']));
create policy package_services_select on public.package_services for select to authenticated
  using (exists (select 1 from public.packages p where p.id = package_services.package_id));

create policy client_packages_select on public.client_packages for select to authenticated
  using (public.is_super_admin() or public.package_visible(business_id, branch_id, client_id));
create policy client_package_services_select on public.client_package_services for select to authenticated
  using (exists (select 1 from public.client_packages c where c.id = client_package_services.client_package_id));
create policy client_package_cancellations_select on public.client_package_cancellations for select to authenticated
  using (exists (select 1 from public.client_packages c where c.id = client_package_cancellations.client_package_id));
create policy session_usages_select on public.session_usages for select to authenticated
  using (exists (select 1 from public.client_packages c where c.id = session_usages.client_package_id));

create policy products_select on public.products for select to authenticated
  using (public.is_super_admin() or public.addon_read_access(business_id, branch_id, 'inventory', array['inventory.view', 'inventory.adjust']));
create policy inventory_settings_select on public.inventory_settings for select to authenticated
  using (public.is_super_admin() or public.addon_read_access(business_id, branch_id, 'inventory', array['inventory.view', 'inventory.adjust']));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (public.is_super_admin() or public.addon_read_access(business_id, branch_id, 'inventory', array['inventory.view', 'inventory.adjust']));

-- least privilege (Supabase grants ALL, including TRUNCATE, to authenticated by default)
revoke all on public.packages, public.package_services, public.client_packages, public.client_package_services,
  public.client_package_cancellations, public.session_usages, public.products, public.inventory_settings,
  public.stock_movements from anon, authenticated;
grant select on public.packages, public.package_services, public.client_packages, public.client_package_services,
  public.client_package_cancellations, public.session_usages, public.products, public.inventory_settings,
  public.stock_movements to authenticated;

-- Staff may deduct a session on their OWN appointments (decided with the user).
insert into public.role_permissions (role_id, permission, scope)
select r.id, 'packages.deduct_session', 'own'::public.permission_scope
from public.roles r where r.business_id is null and r.key = 'staff'
on conflict do nothing;
