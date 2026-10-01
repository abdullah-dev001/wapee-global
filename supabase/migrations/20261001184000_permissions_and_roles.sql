-- Membership, roles, permissions and every RLS helper.
-- Phase 1, part 3 of 4 (a): types, catalogue, roles, grants.

create type public.permission_scope as enum ('own', 'branch', 'all');
create type public.member_status as enum ('invited', 'active', 'disabled');

-- ---------------------------------------------------------------------------
-- permissions: the catalogue (product doc section 9)
-- ---------------------------------------------------------------------------

create table public.permissions (
  key text primary key,
  area text not null,
  -- Lowest plan that unlocks it; null = every plan. Gating lands in Phase 8.
  min_plan public.business_plan,
  -- Add-on module that must be enabled; null = core.
  addon text,
  constraint permissions_key_format check (key ~ '^[a-z_]+\.[a-z_]+$')
);

comment on table public.permissions is
  'Fixed catalogue of area.action permissions. Seeded here; never written by the app.';

insert into public.permissions (key, area, min_plan, addon) values
  ('appointments.view', 'appointments', null, null),
  ('appointments.create', 'appointments', null, null),
  ('appointments.edit', 'appointments', null, null),
  ('appointments.cancel', 'appointments', null, null),
  ('appointments.approve', 'appointments', null, null),
  ('calendar.view_all_staff', 'calendar', null, null),
  ('clients.view', 'clients', null, null),
  ('clients.create', 'clients', null, null),
  ('clients.edit', 'clients', null, null),
  ('clients.view_contact', 'clients', null, null),
  ('clients.view_sensitive', 'clients', null, null),
  ('clients.export', 'clients', null, null),
  ('services.manage', 'services', null, null),
  ('staff.view', 'staff', null, null),
  ('staff.manage', 'staff', null, null),
  ('staff.manage_schedule', 'staff', null, null),
  ('invoices.view', 'invoices', null, null),
  ('invoices.create', 'invoices', null, null),
  ('invoices.discount', 'invoices', null, null),
  ('invoices.credit_note', 'invoices', null, null),
  ('reports.view_basic', 'reports', null, null),
  ('reports.view_advanced', 'reports', 'team'::public.business_plan, null),
  ('reports.view_revenue', 'reports', null, null),
  ('reviews.view', 'reviews', null, null),
  ('reviews.reply', 'reviews', null, null),
  ('reviews.feature_on_website', 'reviews', null, null),
  ('website.edit', 'website', null, null),
  ('website.publish', 'website', null, null),
  ('settings.booking', 'settings', null, null),
  ('settings.business', 'settings', null, null),
  ('settings.billing', 'settings', null, null),
  ('roles.manage', 'roles', null, null),
  ('users.invite', 'users', null, null),
  ('packages.sell', 'packages', null, 'packages'),
  ('packages.deduct_session', 'packages', null, 'packages'),
  ('packages.reverse_session', 'packages', null, 'packages'),
  ('inventory.view', 'inventory', null, 'inventory'),
  ('inventory.adjust', 'inventory', null, 'inventory'),
  ('files.upload', 'files', null, 'files'),
  ('files.view', 'files', null, 'files'),
  ('forms.manage', 'forms', null, 'forms'),
  ('commission.view_own', 'commission', 'team'::public.business_plan, null),
  ('commission.view_all', 'commission', 'team'::public.business_plan, null),
  ('commission.manage_rules', 'commission', 'team'::public.business_plan, null),
  ('sms.send', 'sms', null, null),
  ('sms.buy_credits', 'sms', null, null)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- roles and their permissions
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  -- null = a system role shared by every business. Custom roles (Phase 9) carry a business_id.
  business_id uuid references public.businesses (id) on delete cascade,
  key text not null,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.roles is
  'Named permission bundles. business_id null = the four system roles, which cannot be deleted.';

create unique index roles_system_key_unique on public.roles (key) where business_id is null;
create unique index roles_business_key_unique on public.roles (business_id, key) where business_id is not null;
create index roles_business_id_idx on public.roles (business_id);

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission text not null references public.permissions (key) on delete cascade,
  scope public.permission_scope not null default 'branch',
  primary key (role_id, permission)
);

comment on table public.role_permissions is
  'Which permissions a role grants, and at what scope (own / branch / all).';

create index role_permissions_permission_idx on public.role_permissions (permission);

-- The four system roles (product doc section 5).
insert into public.roles (business_id, key, name, is_system) values
  (null, 'owner', 'Owner', true),
  (null, 'manager', 'Manager', true),
  (null, 'receptionist', 'Receptionist', true),
  (null, 'staff', 'Staff', true)
on conflict do nothing;

-- Grants per the default-roles matrix (product doc section 9).
-- Expressed as rules over the catalogue rather than a long literal list, so the
-- intent stays readable and a new permission cannot be silently missed.

-- Owner: everything, unrestricted.
insert into public.role_permissions (role_id, permission, scope)
select r.id, p.key, 'all'::public.permission_scope
from public.roles r cross join public.permissions p
where r.business_id is null and r.key = 'owner'
on conflict do nothing;

-- Manager: branch operations, but no billing, roles, publishing,
-- commission rules or credit purchases.
insert into public.role_permissions (role_id, permission, scope)
select r.id, p.key, 'branch'::public.permission_scope
from public.roles r cross join public.permissions p
where r.business_id is null and r.key = 'manager'
  and p.key not in (
    'settings.billing', 'roles.manage', 'website.publish',
    'commission.manage_rules', 'sms.buy_credits'
  )
on conflict do nothing;

-- Receptionist: day-to-day desk work. No discounts, credit notes, revenue
-- reports, staff management, website or settings.
insert into public.role_permissions (role_id, permission, scope)
select r.id, p.key, 'branch'::public.permission_scope
from public.roles r cross join public.permissions p
where r.business_id is null and r.key = 'receptionist'
  and p.key in (
    'appointments.view', 'appointments.create', 'appointments.edit',
    'appointments.cancel', 'appointments.approve', 'calendar.view_all_staff',
    'clients.view', 'clients.create', 'clients.edit', 'clients.view_contact',
    'staff.view', 'invoices.view', 'invoices.create', 'reviews.view',
    'packages.sell', 'packages.deduct_session', 'inventory.view',
    'files.upload', 'files.view', 'sms.send'
  )
on conflict do nothing;

-- Staff: their own work only. Sensitive client fields are limited to their own
-- clients, which the 'own' scope expresses.
insert into public.role_permissions (role_id, permission, scope)
select r.id, p.key, 'own'::public.permission_scope
from public.roles r cross join public.permissions p
where r.business_id is null and r.key = 'staff'
  and p.key in (
    'appointments.view', 'appointments.create', 'appointments.edit',
    'clients.view', 'clients.view_sensitive',
    'staff.view', 'staff.manage_schedule',
    'reviews.view', 'commission.view_own', 'files.view'
  )
on conflict do nothing;
