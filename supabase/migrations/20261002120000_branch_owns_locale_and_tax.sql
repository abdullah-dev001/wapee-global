-- Country, currency, timezone and tax settings move to the BRANCH.
-- Product doc decisions 23, 24, 25.
--
-- Why: one business can have branches in different countries (§8.2). The old
-- shape made the business the source of truth, with the branch holding only
-- optional overrides, so slot maths, tax and invoices would all have used the
-- wrong country for a second branch.
--
-- The business keeps default_* copies, nullable, used ONLY to pre-fill a new
-- branch. The name is deliberate: `business.currency` could be used by mistake,
-- `business.default_currency` cannot.

-- ---------------------------------------------------------------------------
-- 1. branches gain the operational columns
-- ---------------------------------------------------------------------------

alter table public.branches
  add column country_code text,
  add column tax_number text,
  add column tax_rate_bp integer not null default 0,
  -- Invoice series per branch (decision 24): prefix + gapless counter.
  add column invoice_prefix text,
  add column invoice_next_no bigint not null default 1;

-- Backfill from the parent business before the NOT NULLs go on.
update public.branches b
set country_code = coalesce(b.country_code, biz.country_code),
    currency     = coalesce(b.currency, biz.currency),
    timezone     = coalesce(b.timezone, biz.timezone),
    tax_number   = coalesce(b.tax_number, biz.tax_number),
    tax_rate_bp  = coalesce(nullif(b.tax_rate_bp, 0), biz.tax_rate_bp)
from public.businesses biz
where biz.id = b.business_id;

-- A prefix for any branch that predates this migration: first 3 letters of the
-- name, uppercased, with a numeric suffix if that collides inside the business.
with candidates as (
  select b.id,
         b.business_id,
         upper(regexp_replace(left(regexp_replace(b.name, '[^A-Za-z]', '', 'g'), 3), '^$', 'BR')) as base,
         row_number() over (
           partition by b.business_id,
             upper(regexp_replace(left(regexp_replace(b.name, '[^A-Za-z]', '', 'g'), 3), '^$', 'BR'))
           order by b.created_at
         ) as n
  from public.branches b
)
update public.branches b
set invoice_prefix = case when c.n = 1 then c.base else c.base || c.n::text end
from candidates c
where c.id = b.id and b.invoice_prefix is null;

alter table public.branches
  alter column country_code set not null,
  alter column currency set not null,
  alter column timezone set not null,
  alter column invoice_prefix set not null;

alter table public.branches
  add constraint branches_country_format check (country_code ~ '^[A-Z]{2}$'),
  add constraint branches_currency_not_null_format check (currency ~ '^[A-Z]{3}$'),
  add constraint branches_tax_rate_range check (tax_rate_bp between 0 and 10000),
  add constraint branches_invoice_prefix_format check (invoice_prefix ~ '^[A-Z0-9][A-Z0-9-]{0,9}$'),
  add constraint branches_invoice_next_no_positive check (invoice_next_no >= 1);

-- Prefix must be unique inside the business, so two branches cannot produce the
-- same invoice number.
create unique index branches_invoice_prefix_unique
  on public.branches (business_id, invoice_prefix)
  where deleted_at is null;

comment on column public.branches.country_code is
  'ISO 3166-1 alpha-2. Drives tax rules and SMS rates for this location.';
comment on column public.branches.currency is
  'ISO 4217. LOCKED once the branch has an invoice or payment (trigger added in Phase 5).';
comment on column public.branches.timezone is
  'IANA. Slot calculation, reminders and "today" use THIS, never the business.';
comment on column public.branches.invoice_prefix is
  'Invoice series prefix, e.g. LDN -> LDN-000123. Unique per business, locked after the first invoice.';
comment on column public.branches.invoice_next_no is
  'Next invoice number in this branch series. Gapless within the branch.';

-- ---------------------------------------------------------------------------
-- 2. businesses: the three columns become pre-fill defaults
-- ---------------------------------------------------------------------------

alter table public.businesses
  drop constraint if exists businesses_country_format,
  drop constraint if exists businesses_currency_format;

alter table public.businesses
  rename column country_code to default_country_code;
alter table public.businesses
  rename column currency to default_currency;
alter table public.businesses
  rename column timezone to default_timezone;

alter table public.businesses
  alter column default_country_code drop not null,
  alter column default_currency drop not null,
  alter column default_timezone drop not null;

alter table public.businesses
  add constraint businesses_default_country_format
    check (default_country_code is null or default_country_code ~ '^[A-Z]{2}$'),
  add constraint businesses_default_currency_format
    check (default_currency is null or default_currency ~ '^[A-Z]{3}$');

comment on column public.businesses.default_country_code is
  'PRE-FILL ONLY for a new branch. Never use for tax, SMS rates or reporting: read the branch.';
comment on column public.businesses.default_currency is
  'PRE-FILL ONLY for a new branch. Money always belongs to a branch currency.';
comment on column public.businesses.default_timezone is
  'PRE-FILL ONLY for a new branch. Slots and reminders use the branch timezone.';

-- Tax settings are legally per location, so the business no longer holds them.
alter table public.businesses
  drop constraint if exists businesses_tax_rate_range;
alter table public.businesses
  drop column tax_number,
  drop column tax_rate_bp;

-- ---------------------------------------------------------------------------
-- 3. Branch currency lock (Phase 5 will extend this to invoices/payments)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_branch_currency_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency then
    -- TODO(phase 5): also block when the branch has any invoice or payment:
    --   if exists (select 1 from public.invoices i where i.branch_id = new.id) ...
    -- The tables do not exist yet, so only the audit trail is written here.
    perform public.write_audit_log(
      new.business_id,
      'branch.currency_changed',
      'branch',
      new.id::text,
      jsonb_build_object('currency', old.currency),
      jsonb_build_object('currency', new.currency)
    );
  end if;

  -- An invoice prefix is a published document identifier: it may be set once.
  if old.invoice_prefix is not null
     and new.invoice_prefix is distinct from old.invoice_prefix
     and old.invoice_next_no > 1 then
    raise exception 'The invoice prefix cannot change once invoices have been issued'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_branch_currency_lock is
  'Audits branch currency changes and locks the invoice prefix once numbering has started. Phase 5 adds the hard currency lock when invoices exist.';

create trigger branches_currency_lock
  before update on public.branches
  for each row execute function public.enforce_branch_currency_lock();

revoke all on function public.enforce_branch_currency_lock() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 4. Signup writes locale to the branch, defaults to the business
-- ---------------------------------------------------------------------------

create or replace function public.suggest_invoice_prefix(p_business_id uuid, p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_candidate text;
  v_suffix integer := 1;
begin
  -- First three letters of the location name, uppercased. "Main salon" -> MAI.
  v_base := upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 3));
  if v_base = '' then
    v_base := 'BR';
  end if;

  v_candidate := v_base;
  while exists (
    select 1 from public.branches b
    where b.business_id = p_business_id
      and b.invoice_prefix = v_candidate
      and b.deleted_at is null
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || v_suffix::text;
  end loop;

  return v_candidate;
end;
$$;

comment on function public.suggest_invoice_prefix is
  'A short invoice prefix from a location name, made unique inside the business.';

grant execute on function public.suggest_invoice_prefix(uuid, text) to authenticated;

create or replace function public.create_business_with_owner(
  p_name text,
  p_slug text,
  p_country_code text,
  p_currency text,
  p_timezone text,
  p_language text default 'en',
  p_industry text default null,
  p_branch_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_branch_id uuid;
  v_branch_name text;
  v_member_id uuid;
  v_owner_role_id uuid;
  v_country text := upper(trim(p_country_code));
  v_currency text := upper(trim(p_currency));
  v_timezone text := trim(p_timezone);
  v_trial_days constant integer := 14;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a business'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.businesses b
    where b.created_by = v_user_id and b.deleted_at is null
  ) then
    raise exception 'You have already created a business'
      using errcode = '23505';
  end if;

  if not public.is_slug_available(lower(trim(p_slug))) then
    raise exception 'That address is not available'
      using errcode = '23514';
  end if;

  -- The business stores these only to pre-fill the next branch.
  insert into public.businesses (
    name, slug, industry, language,
    default_country_code, default_currency, default_timezone,
    status, trial_ends_at, created_by
  )
  values (
    trim(p_name),
    lower(trim(p_slug))::extensions.citext,
    nullif(trim(coalesce(p_industry, '')), ''),
    coalesce(nullif(trim(p_language), ''), 'en'),
    v_country, v_currency, v_timezone,
    'trialing',
    now() + make_interval(days => v_trial_days),
    v_user_id
  )
  returning id into v_business_id;

  v_branch_name := coalesce(nullif(trim(coalesce(p_branch_name, '')), ''), trim(p_name));

  -- The branch is the operational source of truth for locale and tax.
  insert into public.branches (
    business_id, name, is_primary,
    country_code, currency, timezone, invoice_prefix
  )
  values (
    v_business_id, v_branch_name, true,
    v_country, v_currency, v_timezone,
    public.suggest_invoice_prefix(v_business_id, v_branch_name)
  )
  returning id into v_branch_id;

  insert into public.business_members (business_id, user_id, status, joined_at)
  values (v_business_id, v_user_id, 'active', now())
  returning id into v_member_id;

  select id into v_owner_role_id
  from public.roles
  where key = 'owner' and business_id is null;

  if v_owner_role_id is null then
    raise exception 'System Owner role is missing; the seed migration did not run';
  end if;

  insert into public.member_role_assignments (member_id, role_id, branch_id, created_by)
  values (v_member_id, v_owner_role_id, null, v_user_id);

  update public.profiles
  set default_business_id = v_business_id
  where id = v_user_id;

  perform public.write_audit_log(
    v_business_id,
    'business.created',
    'business',
    v_business_id::text,
    null,
    jsonb_build_object(
      'name', trim(p_name),
      'slug', lower(trim(p_slug)),
      'branch_country', v_country,
      'branch_currency', v_currency,
      'trial_days', v_trial_days
    )
  );

  return v_business_id;
end;
$$;

comment on function public.create_business_with_owner is
  'Signup transaction: business + first branch (owns country/currency/timezone) + Owner membership + 14-day trial. All or nothing.';

revoke all on function public.create_business_with_owner(text, text, text, text, text, text, text, text)
  from anon, public;
grant execute on function public.create_business_with_owner(text, text, text, text, text, text, text, text)
  to authenticated;
