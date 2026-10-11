-- Businesses, branches and the reserved-slug guard.
-- Phase 1, part 2 of 4.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Trial -> active (paid) -> inactive (trial ended / not paid). Suspended = admin block.
create type public.business_status as enum ('trialing', 'active', 'inactive', 'suspended');

-- Plan is null while trialing; the trial gets Business-level features (see TRIAL note).
create type public.business_plan as enum ('solo', 'team', 'business');

-- ---------------------------------------------------------------------------
-- Reserved slugs: the DB is the real boundary, src/config/reservedSlugs.ts is the UI copy
-- ---------------------------------------------------------------------------

create table public.reserved_slugs (
  slug extensions.citext primary key
);

comment on table public.reserved_slugs is
  'Slugs no business may take. Mirrors src/config/reservedSlugs.ts; keep both in step.';

insert into public.reserved_slugs (slug) values
  ('login'), ('logout'), ('signup'), ('signin'), ('sign-in'), ('sign-up'),
  ('register'), ('reset'), ('reset-password'), ('forgot-password'), ('verify'), ('invite'),
  ('onboarding'), ('app'), ('dashboard'), ('portal'), ('admin'), ('superadmin'),
  ('super-admin'), ('settings'), ('account'), ('profile'), ('billing'), ('subscribe'),
  ('subscription'), ('plans'), ('pricing'), ('book'), ('booking'), ('bookings'),
  ('appointments'), ('calendar'), ('clients'), ('services'), ('staff'), ('invoices'),
  ('reports'), ('reviews'), ('widget'), ('embed'), ('api'), ('www'),
  ('cdn'), ('static'), ('assets'), ('media'), ('files'), ('img'),
  ('images'), ('mail'), ('email'), ('smtp'), ('ftp'), ('ns'),
  ('dns'), ('mx'), ('webhook'), ('webhooks'), ('callback'), ('oauth'),
  ('auth'), ('sso'), ('graphql'), ('rest'), ('rpc'), ('health'),
  ('status'), ('test'), ('staging'), ('dev'), ('demo'), ('sandbox'),
  ('preview'), ('beta'), ('alpha'), ('public'), ('private'), ('internal'),
  ('system'), ('root'), ('null'), ('undefined'), ('robots.txt'), ('sitemap.xml'),
  ('favicon.ico'), ('manifest.json'), ('sw.js'), ('.well-known'), ('wapee'), ('wapeeapp'),
  ('official'), ('support'), ('help'), ('contact'), ('about'), ('legal'),
  ('privacy'), ('terms'), ('security'), ('abuse'), ('press'), ('blog'),
  ('news'), ('careers'), ('jobs'), ('partners'), ('affiliate'), ('store'),
  ('shop'), ('payment'), ('payments'), ('checkout')
on conflict do nothing;

-- Readable by anyone so the signup form can check availability before submitting.
alter table public.reserved_slugs enable row level security;

create policy reserved_slugs_select_all
  on public.reserved_slugs for select
  to anon, authenticated
  using (true);

grant select on public.reserved_slugs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug extensions.citext not null unique,
  industry text,
  country_code text not null,
  -- Defaults come from the country at signup; the owner can override both.
  currency text not null,
  timezone text not null,
  language text not null default 'en',
  -- Tax settings used by invoices (Phase 5). Rate in basis points: 2000 = 20%.
  tax_number text,
  tax_rate_bp integer not null default 0,

  -- Plan / trial / status
  plan public.business_plan,
  status public.business_status not null default 'trialing',
  trial_ends_at timestamptz,
  plan_activated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  constraint businesses_name_length check (char_length(name) between 1 and 120),
  constraint businesses_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint businesses_slug_length check (char_length(slug::text) between 3 and 40),
  constraint businesses_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint businesses_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint businesses_tax_rate_range check (tax_rate_bp between 0 and 10000),
  -- A trialing business must know when the trial ends; an active one must have a plan.
  constraint businesses_trial_has_end check (status <> 'trialing' or trial_ends_at is not null),
  constraint businesses_active_has_plan check (status <> 'active' or plan is not null)
);

comment on table public.businesses is
  'Tenant root. status drives access: trialing/active can work, inactive/suspended are locked out.';
comment on column public.businesses.tax_rate_bp is
  'Tax rate in basis points (2000 = 20%). Integer, never a float.';

create index businesses_status_idx on public.businesses (status) where deleted_at is null;
create index businesses_created_by_idx on public.businesses (created_by);
create index businesses_name_trgm_idx on public.businesses using gin (name extensions.gin_trgm_ops);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Slug guard: reserved list + format, enforced in the DB
-- ---------------------------------------------------------------------------

create or replace function public.enforce_business_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.slug := lower(trim(new.slug::text))::extensions.citext;

  if exists (select 1 from public.reserved_slugs r where r.slug = new.slug) then
    raise exception 'The address "%" is reserved. Please choose another.', new.slug
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_business_slug is
  'Normalises the slug and rejects anything on the reserved list.';

create trigger businesses_enforce_slug
  before insert or update of slug on public.businesses
  for each row execute function public.enforce_business_slug();

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  -- Exactly one primary branch per business (partial unique index below).
  is_primary boolean not null default false,
  -- Per-branch overrides exist from day one so Phase 9 multi-branch adds no columns.
  timezone text,
  currency text,
  address text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint branches_name_length check (char_length(name) between 1 and 120),
  constraint branches_currency_format check (currency is null or currency ~ '^[A-Z]{3}$')
);

comment on table public.branches is
  'A location. One row per business until multi-branch (Phase 9); timezone/currency override the business.';

create index branches_business_id_idx on public.branches (business_id) where deleted_at is null;
create unique index branches_one_primary_per_business
  on public.branches (business_id)
  where is_primary and deleted_at is null;

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

-- profiles.default_business_id can now point at a real business.
alter table public.profiles
  add constraint profiles_default_business_fk
  foreign key (default_business_id) references public.businesses (id) on delete set null;

-- RLS is enabled here but the policies land in part 3, once membership
-- and permission helpers exist. Until then only the service role can read.
alter table public.businesses enable row level security;
alter table public.branches enable row level security;
