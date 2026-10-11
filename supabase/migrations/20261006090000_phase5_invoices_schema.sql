-- Phase 5A: invoices backend, schema.
--
-- Tables: invoices, invoice_items, invoice_payments, credit_notes.
-- Decided with the user (2026-10-05):
--   * number = <branch prefix>-<6-digit seq>, gapless per branch, assigned at ISSUE
--   * credit notes: their own gapless series <prefix>-CN-<seq> per branch
--   * tax-exclusive pricing; rate/number snapshotted at issue
--   * draft (editable, no number) -> issued (numbered, IMMUTABLE)
--   * payments and credit notes are append-only; a refund is a payment
--     REVERSAL row (partial allowed), never an edit
--   * a fully credit-noted appointment invoice stays linked (no re-invoice)
--
-- Every write goes through a SECURITY DEFINER RPC (next migrations). The
-- tables therefore get a SELECT policy only: no INSERT/UPDATE/DELETE policy
-- exists for anyone, and authenticated holds no write privilege.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'issued');
create type public.invoice_payment_kind as enum ('payment', 'reversal');
create type public.invoice_payment_method as enum ('cash', 'card', 'bank_transfer');

-- ---------------------------------------------------------------------------
-- branches: credit-note counter + numbering protection
-- ---------------------------------------------------------------------------
alter table public.branches
  add column credit_note_next_no bigint not null default 1,
  add constraint branches_credit_note_next_no_positive check (credit_note_next_no >= 1);

comment on column public.branches.credit_note_next_no is
  'Next credit-note number for this branch (own gapless series <prefix>-CN-<n>). Moved only by the invoice RPCs.';

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  branch_id       uuid not null references public.branches (id),
  client_id       uuid references public.clients (id),
  appointment_id  uuid references public.appointments (id),
  status          public.invoice_status not null default 'draft',
  number          text,
  number_seq      bigint,
  currency        text not null,
  tax_rate_bp     integer not null default 0,
  tax_number      text,
  bill_to_name    text,
  notes           text,
  subtotal_minor  bigint not null default 0,
  discount_minor  bigint not null default 0,
  net_minor       bigint not null default 0,
  tax_minor       bigint not null default 0,
  total_minor     bigint not null default 0,
  issued_at       timestamptz,
  issued_by       uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  created_by      uuid,
  constraint invoices_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint invoices_tax_rate_range check (tax_rate_bp between 0 and 10000),
  constraint invoices_amounts_nonnegative check (
    subtotal_minor >= 0 and discount_minor >= 0 and net_minor >= 0
    and tax_minor >= 0 and total_minor >= 0),
  constraint invoices_amounts_add_up check (
    net_minor = subtotal_minor - discount_minor and total_minor = net_minor + tax_minor),
  constraint invoices_status_shape check (
    (status = 'draft' and number is null and number_seq is null and issued_at is null)
    or (status = 'issued' and number is not null and number_seq is not null
        and issued_at is not null and deleted_at is null))
);

comment on table public.invoices is
  'Draft (editable, no number) or issued (numbered, immutable). Money in minor units, currency from the branch. Written only by RPCs.';

create unique index invoices_branch_number_seq_key
  on public.invoices (branch_id, number_seq) where number_seq is not null;
create unique index invoices_business_number_key
  on public.invoices (business_id, number) where number is not null;
-- One LIVE invoice per appointment (a discarded draft frees it).
create unique index invoices_one_live_per_appointment
  on public.invoices (appointment_id) where appointment_id is not null and deleted_at is null;
create index invoices_branch_created_idx on public.invoices (business_id, branch_id, created_at desc, id desc);
create index invoices_client_idx on public.invoices (client_id) where client_id is not null;
create index invoices_issued_at_idx on public.invoices (branch_id, issued_at) where status = 'issued';
create index invoices_number_trgm on public.invoices using gin (number extensions.gin_trgm_ops);
create index invoices_bill_to_trgm on public.invoices using gin (bill_to_name extensions.gin_trgm_ops);

create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoice_items (price at sale time)
-- ---------------------------------------------------------------------------
create table public.invoice_items (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  branch_id        uuid not null references public.branches (id),
  invoice_id       uuid not null references public.invoices (id) on delete cascade,
  sort_order       integer not null default 0,
  service_id       uuid references public.services (id),
  description      text not null,
  quantity         integer not null,
  unit_price_minor bigint not null,
  discount_minor   bigint not null default 0,
  discount_reason  text,
  line_net_minor   bigint generated always as (quantity::bigint * unit_price_minor - discount_minor) stored,
  created_at       timestamptz not null default now(),
  constraint invoice_items_description check (char_length(btrim(description)) between 1 and 200),
  constraint invoice_items_quantity check (quantity between 1 and 9999),
  constraint invoice_items_price check (unit_price_minor between 0 and 100000000000),
  constraint invoice_items_discount_range check (
    discount_minor >= 0 and discount_minor <= quantity::bigint * unit_price_minor),
  constraint invoice_items_discount_reason check (
    discount_minor = 0 or char_length(btrim(coalesce(discount_reason, ''))) >= 3)
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id, sort_order);
create index invoice_items_branch_idx on public.invoice_items (branch_id);
create index invoice_items_business_idx on public.invoice_items (business_id);
create index invoice_items_service_idx on public.invoice_items (service_id) where service_id is not null;

-- ---------------------------------------------------------------------------
-- invoice_payments (append-only: payments and reversals)
-- ---------------------------------------------------------------------------
create table public.invoice_payments (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses (id) on delete cascade,
  branch_id            uuid not null references public.branches (id),
  invoice_id           uuid not null references public.invoices (id) on delete cascade,
  kind                 public.invoice_payment_kind not null,
  method               public.invoice_payment_method not null,
  amount_minor         bigint not null,
  currency             text not null,
  reverses_payment_id  uuid references public.invoice_payments (id),
  reason               text,
  note                 text,
  paid_at              timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  created_by           uuid,
  constraint invoice_payments_amount check (amount_minor > 0),
  constraint invoice_payments_shape check (
    (kind = 'payment' and reverses_payment_id is null)
    or (kind = 'reversal' and reverses_payment_id is not null
        and char_length(btrim(coalesce(reason, ''))) >= 3))
);

create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id, paid_at);
create index invoice_payments_branch_paid_idx on public.invoice_payments (branch_id, paid_at);
create index invoice_payments_business_idx on public.invoice_payments (business_id);
create index invoice_payments_reverses_idx on public.invoice_payments (reverses_payment_id)
  where reverses_payment_id is not null;

-- ---------------------------------------------------------------------------
-- credit_notes (append-only, own gapless series)
-- ---------------------------------------------------------------------------
create table public.credit_notes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  branch_id    uuid not null references public.branches (id),
  invoice_id   uuid not null references public.invoices (id) on delete cascade,
  number       text not null,
  number_seq   bigint not null,
  currency     text not null,
  tax_rate_bp  integer not null,
  net_minor    bigint not null,
  tax_minor    bigint not null,
  total_minor  bigint not null,
  reason       text not null,
  issued_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  created_by   uuid,
  constraint credit_notes_amounts check (
    net_minor > 0 and tax_minor >= 0 and total_minor = net_minor + tax_minor),
  constraint credit_notes_reason check (char_length(btrim(reason)) >= 3)
);

create unique index credit_notes_branch_seq_key on public.credit_notes (branch_id, number_seq);
create unique index credit_notes_business_number_key on public.credit_notes (business_id, number);
create index credit_notes_invoice_idx on public.credit_notes (invoice_id);
create index credit_notes_branch_issued_idx on public.credit_notes (branch_id, issued_at);
create index credit_notes_business_idx on public.credit_notes (business_id);

-- ---------------------------------------------------------------------------
-- Immutability + tenant guards.
-- Each one lets the row go when the BUSINESS itself is being deleted
-- (the recurring cascade trap, see context/_handoff.md).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_invoice_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return old;
    end if;
    raise exception 'Invoices are never deleted; discard a draft instead'
      using errcode = '23514';
  end if;

  if old.status = 'issued' then
    raise exception 'An issued invoice is immutable; fix it with a credit note or a payment reversal'
      using errcode = '23514';
  end if;

  if new.business_id is distinct from old.business_id
     or new.branch_id is distinct from old.branch_id then
    raise exception 'An invoice cannot move between businesses or branches' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger invoices_guard before update or delete on public.invoices
  for each row execute function public.enforce_invoice_guard();

create or replace function public.enforce_invoice_item_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return old;
    end if;
    select i.status into v_inv from public.invoices i where i.id = old.invoice_id;
    if v_inv.status is distinct from 'draft' then
      raise exception 'Items of an issued invoice are immutable' using errcode = '23514';
    end if;
    return old;
  end if;

  select i.status, i.business_id, i.branch_id into v_inv
  from public.invoices i where i.id = new.invoice_id;
  if v_inv.status is distinct from 'draft' then
    raise exception 'Items of an issued invoice are immutable' using errcode = '23514';
  end if;
  if new.business_id <> v_inv.business_id or new.branch_id <> v_inv.branch_id then
    raise exception 'Invoice item does not match its invoice''s business/branch' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'An item cannot move between invoices' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function public.enforce_invoice_item_guard();

-- payments and credit notes: append-only, must hang off an ISSUED invoice of
-- the same business/branch/currency.
create or replace function public.enforce_invoice_ledger_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
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

  select i.status, i.business_id, i.branch_id, i.currency into v_inv
  from public.invoices i where i.id = new.invoice_id;
  if v_inv.status is distinct from 'issued' then
    raise exception 'Only an issued invoice can take payments or credit notes' using errcode = '23514';
  end if;
  if new.business_id <> v_inv.business_id or new.branch_id <> v_inv.branch_id
     or new.currency <> v_inv.currency then
    raise exception '% row does not match its invoice''s business/branch/currency', tg_table_name
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger invoice_payments_guard before insert or update or delete on public.invoice_payments
  for each row execute function public.enforce_invoice_ledger_guard();
create trigger credit_notes_guard before insert or update or delete on public.credit_notes
  for each row execute function public.enforce_invoice_ledger_guard();

revoke all on function public.enforce_invoice_guard() from anon, authenticated, public;
revoke all on function public.enforce_invoice_item_guard() from anon, authenticated, public;
revoke all on function public.enforce_invoice_ledger_guard() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Branch: hard currency lock + numbering protection (replaces the Phase 1
-- audit-only version).
--  * currency cannot change while the branch has a live invoice (payments and
--    credit notes only exist on issued invoices, so this covers them too)
--  * the two counters move ONLY inside the invoice RPCs, which switch on the
--    transaction-local flag 'wapee.numbering'. Without this an Owner could
--    PATCH invoice_next_no and create gaps/duplicates.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_branch_currency_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency then
    if exists (
      select 1 from public.invoices i
      where i.branch_id = old.id and i.deleted_at is null
    ) then
      raise exception 'The branch currency cannot change once the branch has invoices or payments'
        using errcode = '23514';
    end if;
    perform public.write_audit_log(
      new.business_id, 'branch.currency_changed', 'branch', new.id::text,
      jsonb_build_object('currency', old.currency),
      jsonb_build_object('currency', new.currency)
    );
  end if;

  if old.invoice_prefix is not null
     and new.invoice_prefix is distinct from old.invoice_prefix
     and old.invoice_next_no > 1 then
    raise exception 'The invoice prefix cannot change once invoices have been issued'
      using errcode = '23514';
  end if;

  if (new.invoice_next_no is distinct from old.invoice_next_no
      or new.credit_note_next_no is distinct from old.credit_note_next_no)
     and coalesce(current_setting('wapee.numbering', true), '') <> 'on' then
    raise exception 'Invoice and credit-note counters are moved only by the invoice functions'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- appointments.invoice_id: real FK + RPC-only writes
-- ---------------------------------------------------------------------------
alter table public.appointments
  add constraint appointments_invoice_id_fkey foreign key (invoice_id) references public.invoices (id);
create index appointments_invoice_idx on public.appointments (invoice_id) where invoice_id is not null;

-- The column is the reopen guard and the "already invoiced" marker, so a
-- direct PATCH (appointments.edit is enough for RLS) must not touch it.
create or replace function public.enforce_appointment_invoice_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.invoice_id is not null)
     or (tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id) then
    if coalesce(current_setting('wapee.invoice_link', true), '') <> 'on' then
      raise exception 'appointments.invoice_id is managed by the invoice functions'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger appointments_invoice_link_guard
  before insert or update on public.appointments
  for each row execute function public.enforce_appointment_invoice_link();
revoke all on function public.enforce_appointment_invoice_link() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- RLS: read only; the RPCs (DEFINER) are the write path.
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.credit_notes enable row level security;

create policy invoices_select on public.invoices for select to authenticated
  using (public.can(business_id, branch_id, 'invoices.view')
         and public.has_permission_at_branch_scope(business_id, branch_id, 'invoices.view'));
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (public.can(business_id, branch_id, 'invoices.view')
         and public.has_permission_at_branch_scope(business_id, branch_id, 'invoices.view'));
create policy invoice_payments_select on public.invoice_payments for select to authenticated
  using (public.can(business_id, branch_id, 'invoices.view')
         and public.has_permission_at_branch_scope(business_id, branch_id, 'invoices.view'));
create policy credit_notes_select on public.credit_notes for select to authenticated
  using (public.can(business_id, branch_id, 'invoices.view')
         and public.has_permission_at_branch_scope(business_id, branch_id, 'invoices.view'));

revoke all on public.invoices, public.invoice_items, public.invoice_payments, public.credit_notes
  from anon, authenticated, public;
grant select on public.invoices, public.invoice_items, public.invoice_payments, public.credit_notes
  to authenticated;
