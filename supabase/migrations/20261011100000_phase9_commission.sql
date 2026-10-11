-- Phase 9A (2/4): staff commission (feature `commission`).
--
-- Decided with the user (2026-10-06 questions, answered with the recommendations):
--   BASE      per invoice line that has a service: price x qty minus the line's
--             discount, TAX EXCLUDED. percent = half-up of that net; flat = flat
--             amount per unit x quantity (never more than the line net). Rule =
--             (appointment's staff, line's service), else that staff's default
--             rule (service null), else nothing. A free-text line (no service)
--             earns only a default PERCENT rule, never a flat amount.
--   WHEN      only when the invoice is FULLY paid (payment_status = 'paid').
--             Partial payments earn nothing. Computed once, in the same
--             transaction as the payment / credit note that made it paid.
--   REVERSALS credit note -> proportional (credited net / invoice net; the credit
--             that exhausts the net takes the exact remainder, no drift).
--             payment reversal -> only when the invoice stops being fully paid
--             (then the whole remaining commission). A refund after a credit
--             note does NOT reverse again. If the invoice is fully paid again
--             later, commission is earned again as NEW rows.
--   Entries are permanent and immutable (reversals are new rows).
--
-- Mechanism: commission_sync(invoice) is called by AFTER INSERT triggers on
-- invoice_payments and credit_notes, so it runs inside the same transaction as
-- add_payment / reverse_payment / create_credit_note, which already hold the
-- invoice row lock. It computes the DESIRED commission per line from the
-- invoice's current state and writes only the difference (earn or reversal),
-- so it is idempotent and two concurrent payments cannot double-earn.

create type public.commission_rule_kind as enum ('percent', 'flat', 'none');
create type public.commission_entry_kind as enum ('earn', 'reversal');

-- ---------------------------------------------------------------------------
-- commission_rules: append-only versions. "Editing" a rule inserts a newer
-- version; the latest effective_from <= the day it is earned wins.
-- ---------------------------------------------------------------------------
create table public.commission_rules (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  staff_id       uuid not null references public.staff_profiles (id) on delete cascade,
  -- null = this staff member's default rule
  service_id     uuid references public.services (id) on delete cascade,
  kind           public.commission_rule_kind not null,
  percent_bp     integer,
  flat_minor     bigint,
  -- a flat amount is in ONE currency (branches may differ); percent has none
  currency       text,
  effective_from date not null,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,
  constraint commission_rules_shape check (
    (kind = 'percent' and percent_bp between 0 and 10000 and flat_minor is null and currency is null)
    or (kind = 'flat' and flat_minor between 0 and 100000000000 and percent_bp is null
        and currency ~ '^[A-Z]{3}$')
    or (kind = 'none' and percent_bp is null and flat_minor is null and currency is null))
);
create index commission_rules_lookup_idx
  on public.commission_rules (staff_id, service_id, effective_from desc, created_at desc);
create index commission_rules_business_idx on public.commission_rules (business_id);
create index commission_rules_service_idx on public.commission_rules (service_id) where service_id is not null;

-- ---------------------------------------------------------------------------
-- commission_lines: the snapshot taken ONCE, the first time an invoice is fully
-- paid. It pins the rule and the full commission of each line, so later rule
-- edits never change an invoice and a later re-earn uses the same numbers.
-- ---------------------------------------------------------------------------
create table public.commission_lines (
  invoice_item_id        uuid primary key references public.invoice_items (id) on delete cascade,
  business_id            uuid not null references public.businesses (id) on delete cascade,
  branch_id              uuid not null references public.branches (id),
  invoice_id             uuid not null references public.invoices (id) on delete cascade,
  staff_id               uuid not null references public.staff_profiles (id) on delete cascade,
  rule_id                uuid references public.commission_rules (id),
  -- percent | flat | none | feature_off (the plan had no commission when it was paid)
  rule_kind              text not null,
  percent_bp             integer,
  flat_minor             bigint,
  currency               text not null,
  quantity               integer not null,
  line_net_minor         bigint not null,
  full_commission_minor  bigint not null,
  created_at             timestamptz not null default now(),
  constraint commission_lines_full check (full_commission_minor >= 0 and full_commission_minor <= greatest(line_net_minor, 0))
);
create index commission_lines_invoice_idx on public.commission_lines (invoice_id);
create index commission_lines_staff_idx on public.commission_lines (staff_id);
create index commission_lines_business_idx on public.commission_lines (business_id);
create index commission_lines_branch_idx on public.commission_lines (branch_id);

create table public.commission_entries (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses (id) on delete cascade,
  branch_id             uuid not null references public.branches (id),
  invoice_id            uuid not null references public.invoices (id) on delete cascade,
  invoice_item_id       uuid not null references public.invoice_items (id) on delete cascade,
  staff_id              uuid not null references public.staff_profiles (id) on delete cascade,
  kind                  public.commission_entry_kind not null,
  amount_minor          bigint not null,
  currency              text not null,
  -- paid | credit_note | unpaid
  reason                text not null,
  source_payment_id     uuid references public.invoice_payments (id),
  source_credit_note_id uuid references public.credit_notes (id),
  created_at            timestamptz not null default now(),
  created_by            uuid,
  constraint commission_entries_amount check (amount_minor > 0),
  constraint commission_entries_reason check (reason in ('paid', 'credit_note', 'unpaid')),
  constraint commission_entries_reason_kind check (
    (kind = 'earn' and reason = 'paid') or (kind = 'reversal' and reason in ('credit_note', 'unpaid')))
);
create index commission_entries_staff_idx on public.commission_entries (business_id, staff_id, created_at desc);
create index commission_entries_branch_idx on public.commission_entries (branch_id, created_at desc);
create index commission_entries_invoice_idx on public.commission_entries (invoice_id);
create index commission_entries_item_idx on public.commission_entries (invoice_item_id);
create index commission_entries_staff_only_idx on public.commission_entries (staff_id);
create index commission_entries_payment_idx on public.commission_entries (source_payment_id) where source_payment_id is not null;
create index commission_entries_credit_idx on public.commission_entries (source_credit_note_id) where source_credit_note_id is not null;

-- ---------------------------------------------------------------------------
-- Immutability (all three: append-only) + the balance backstop on entries.
-- Every guard lets the row go when the BUSINESS is being deleted (cascade trap).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_commission_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses b where b.id = old.business_id) then
      return old;
    end if;
    raise exception '% rows are permanent and cannot be deleted', tg_table_name using errcode = '23514';
  end if;
  raise exception '% rows are permanent and cannot be changed', tg_table_name using errcode = '23514';
end $$;
revoke all on function public.enforce_commission_immutable() from public, anon, authenticated;
create trigger commission_rules_immutable before update or delete on public.commission_rules
  for each row execute function public.enforce_commission_immutable();
create trigger commission_lines_immutable before update or delete on public.commission_lines
  for each row execute function public.enforce_commission_immutable();
create trigger commission_entries_immutable before update or delete on public.commission_entries
  for each row execute function public.enforce_commission_immutable();

-- Backstop for ANY writer: an item's running balance (earned - reversed) must
-- stay within [0, its full commission], and the row must match its line.
create or replace function public.enforce_commission_entry_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_line public.commission_lines;
  v_bal bigint;
begin
  select * into v_line from public.commission_lines l where l.invoice_item_id = new.invoice_item_id for update;
  if not found then
    raise exception 'A commission entry needs its commission line' using errcode = '23514';
  end if;
  if new.staff_id <> v_line.staff_id or new.business_id <> v_line.business_id
     or new.branch_id <> v_line.branch_id or new.invoice_id <> v_line.invoice_id
     or new.currency <> v_line.currency then
    raise exception 'Commission entry does not match its line' using errcode = '23514';
  end if;
  select coalesce(sum(case e.kind when 'earn' then e.amount_minor else -e.amount_minor end), 0) into v_bal
  from public.commission_entries e where e.invoice_item_id = new.invoice_item_id;
  v_bal := v_bal + case new.kind when 'earn' then new.amount_minor else -new.amount_minor end;
  if v_bal < 0 or v_bal > v_line.full_commission_minor then
    raise exception 'commission_balance_out_of_range' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.enforce_commission_entry_balance() from public, anon, authenticated;
create trigger commission_entries_balance before insert on public.commission_entries
  for each row execute function public.enforce_commission_entry_balance();

-- ---------------------------------------------------------------------------
-- RLS: SELECT only. Writes happen in DEFINER code.
--   entries/lines: commission.view_all at branch/all scope for that branch, or
--   commission.view_own on the caller's own staff profile ("staff see only own").
--   rules: the people who may see that staff member's commission.
-- ---------------------------------------------------------------------------
alter table public.commission_rules enable row level security;
alter table public.commission_lines enable row level security;
alter table public.commission_entries enable row level security;

create or replace function public.commission_can_see(p_business_id uuid, p_branch_id uuid, p_staff_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin()
      or (public.can(p_business_id, p_branch_id, 'commission.view_all')
          and public.has_permission_at_branch_scope(p_business_id, p_branch_id, 'commission.view_all'))
      or (public.can(p_business_id, p_branch_id, 'commission.view_own')
          and public.is_own_staff_profile(p_staff_id))
$$;
revoke all on function public.commission_can_see(uuid, uuid, uuid) from public, anon;
grant execute on function public.commission_can_see(uuid, uuid, uuid) to authenticated;

create policy commission_entries_select on public.commission_entries for select to authenticated
  using (public.commission_can_see(business_id, branch_id, staff_id));
create policy commission_lines_select on public.commission_lines for select to authenticated
  using (public.commission_can_see(business_id, branch_id, staff_id));
create policy commission_rules_select on public.commission_rules for select to authenticated
  using (
    public.is_super_admin()
    or (public.can(business_id, null, 'commission.manage_rules'))
    or exists (select 1 from public.staff_branches sb
               where sb.staff_id = commission_rules.staff_id
                 and public.commission_can_see(commission_rules.business_id, sb.branch_id, commission_rules.staff_id))
    or (public.can(business_id, null, 'commission.view_own') and public.is_own_staff_profile(staff_id)));

revoke all on public.commission_rules, public.commission_lines, public.commission_entries from anon, authenticated;
grant select on public.commission_rules, public.commission_lines, public.commission_entries to authenticated;

-- ---------------------------------------------------------------------------
-- The engine
-- ---------------------------------------------------------------------------
create or replace function public.commission_sync(
  p_invoice_id uuid, p_payment_id uuid default null, p_credit_note_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_inv record;
  v_staff uuid;
  v_tz text;
  v_today date;
  v_status text;
  v_rem_net bigint;
  l record;
  v_rule_id uuid;
  v_rule_kind public.commission_rule_kind;
  v_rule_bp integer;
  v_rule_flat bigint;
  v_full bigint;
  v_kind text;
  v_bal bigint;
  v_want bigint;
  v_has_lines boolean;
  v_feature boolean;
begin
  select i.id, i.business_id, i.branch_id, i.status, i.currency, i.net_minor, i.appointment_id, i.deleted_at
    into v_inv from public.invoices i where i.id = p_invoice_id for update;
  if v_inv.id is null or v_inv.status <> 'issued' or v_inv.deleted_at is not null or v_inv.appointment_id is null then
    return;
  end if;
  select a.staff_id into v_staff from public.appointments a where a.id = v_inv.appointment_id;
  if v_staff is null then
    return;
  end if;

  v_status := public.invoice_money(p_invoice_id) ->> 'payment_status';
  select exists (select 1 from public.commission_lines cl where cl.invoice_id = p_invoice_id) into v_has_lines;

  if not v_has_lines then
    if v_status <> 'paid' then
      return; -- nothing earned until FULLY paid
    end if;
    v_feature := public.business_has_feature(v_inv.business_id, 'commission');
    select b.timezone into v_tz from public.branches b where b.id = v_inv.branch_id;
    v_today := (now() at time zone v_tz)::date;
    for l in select it.id, it.service_id, it.quantity, it.line_net_minor
             from public.invoice_items it where it.invoice_id = p_invoice_id order by it.sort_order, it.id loop
      v_rule_id := null; v_rule_kind := null; v_rule_bp := null; v_rule_flat := null;
      v_full := 0;
      v_kind := case when v_feature then 'none' else 'feature_off' end;
      if v_feature then
        -- 1) the (staff, service) rule, 2) the staff default; latest version wins
        if l.service_id is not null then
          select cr.id, cr.kind, cr.percent_bp, cr.flat_minor into v_rule_id, v_rule_kind, v_rule_bp, v_rule_flat
          from public.commission_rules cr
          where cr.staff_id = v_staff and cr.service_id = l.service_id and cr.effective_from <= v_today
            and (cr.kind <> 'flat' or cr.currency = v_inv.currency)
          order by cr.effective_from desc, cr.created_at desc, cr.id desc limit 1;
        end if;
        if v_rule_id is null then
          select cr.id, cr.kind, cr.percent_bp, cr.flat_minor into v_rule_id, v_rule_kind, v_rule_bp, v_rule_flat
          from public.commission_rules cr
          where cr.staff_id = v_staff and cr.service_id is null and cr.effective_from <= v_today
            and (cr.kind <> 'flat' or cr.currency = v_inv.currency)
            -- a free-text line earns only a default PERCENT
            and (l.service_id is not null or cr.kind <> 'flat')
          order by cr.effective_from desc, cr.created_at desc, cr.id desc limit 1;
        end if;
        if v_rule_id is not null then
          v_kind := v_rule_kind::text;
          if v_rule_kind = 'percent' then
            v_full := floor((greatest(l.line_net_minor, 0)::numeric * v_rule_bp + 5000) / 10000)::bigint;
          elsif v_rule_kind = 'flat' then
            v_full := least(v_rule_flat * l.quantity, greatest(l.line_net_minor, 0));
          end if;
        end if;
      end if;
      insert into public.commission_lines
        (invoice_item_id, business_id, branch_id, invoice_id, staff_id, rule_id, rule_kind, percent_bp, flat_minor,
         currency, quantity, line_net_minor, full_commission_minor)
      values
        (l.id, v_inv.business_id, v_inv.branch_id, p_invoice_id, v_staff, v_rule_id, v_kind,
         case when v_kind = 'percent' then v_rule_bp end,
         case when v_kind = 'flat' then v_rule_flat end,
         v_inv.currency, l.quantity, l.line_net_minor, v_full);
    end loop;
  end if;

  select v_inv.net_minor - coalesce(sum(c.net_minor), 0) into v_rem_net
  from public.credit_notes c where c.invoice_id = p_invoice_id;

  for l in select cl.invoice_item_id, cl.staff_id, cl.full_commission_minor, cl.currency
           from public.commission_lines cl where cl.invoice_id = p_invoice_id order by cl.invoice_item_id loop
    select coalesce(sum(case e.kind when 'earn' then e.amount_minor else -e.amount_minor end), 0) into v_bal
    from public.commission_entries e where e.invoice_item_id = l.invoice_item_id;

    -- what the line SHOULD hold now: the full commission scaled by the share of
    -- the net still standing, but only while the invoice is fully paid
    if v_status = 'paid' and v_inv.net_minor > 0 and v_rem_net > 0 then
      v_want := least(l.full_commission_minor,
                      floor((2 * l.full_commission_minor::numeric * v_rem_net + v_inv.net_minor)
                            / (2 * v_inv.net_minor::numeric))::bigint);
    else
      v_want := 0;
    end if;

    if v_want > v_bal then
      insert into public.commission_entries
        (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason,
         source_payment_id, source_credit_note_id, created_by)
      values (v_inv.business_id, v_inv.branch_id, p_invoice_id, l.invoice_item_id, l.staff_id, 'earn',
              v_want - v_bal, l.currency, 'paid', p_payment_id, p_credit_note_id, auth.uid());
    elsif v_want < v_bal then
      insert into public.commission_entries
        (business_id, branch_id, invoice_id, invoice_item_id, staff_id, kind, amount_minor, currency, reason,
         source_payment_id, source_credit_note_id, created_by)
      values (v_inv.business_id, v_inv.branch_id, p_invoice_id, l.invoice_item_id, l.staff_id, 'reversal',
              v_bal - v_want, l.currency, case when v_status = 'paid' then 'credit_note' else 'unpaid' end,
              p_payment_id, p_credit_note_id, auth.uid());
    end if;
  end loop;
end $$;
revoke all on function public.commission_sync(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.commission_after_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.commission_sync(new.invoice_id, new.id, null);
  return new;
end $$;
revoke all on function public.commission_after_payment() from public, anon, authenticated;
create trigger invoice_payments_commission after insert on public.invoice_payments
  for each row execute function public.commission_after_payment();

create or replace function public.commission_after_credit_note()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.commission_sync(new.invoice_id, null, new.id);
  return new;
end $$;
revoke all on function public.commission_after_credit_note() from public, anon, authenticated;
create trigger credit_notes_commission after insert on public.credit_notes
  for each row execute function public.commission_after_credit_note();

-- ---------------------------------------------------------------------------
-- RPC: set a rule (inserts a new version). kind 'none' = explicitly no
-- commission from that date (overrides the staff default for a service).
-- ---------------------------------------------------------------------------
create or replace function public.set_commission_rule(
  p_staff_id uuid,
  p_service_id uuid,
  p_kind text,
  p_percent_bp integer default null,
  p_flat_minor bigint default null,
  p_currency text default null,
  p_effective_from date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_staff record;
  v_gate jsonb;
  v_date date := coalesce(p_effective_from, current_date);
  v_id uuid;
begin
  select sp.id, sp.business_id, sp.deleted_at into v_staff from public.staff_profiles sp where sp.id = p_staff_id;
  if v_staff.id is null or v_staff.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if (select auth.uid()) is null
     or not public.can(v_staff.business_id, null, 'commission.manage_rules')
     or exists (select 1 from public.staff_branches sb where sb.staff_id = p_staff_id
                and not public.has_permission_at_branch_scope(v_staff.business_id, sb.branch_id, 'commission.manage_rules')) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(v_staff.business_id, 'commission');
  if v_gate is not null then return v_gate; end if;

  if p_kind is null or p_kind not in ('percent', 'flat', 'none') then
    return jsonb_build_object('ok', false, 'code', 'invalid_kind');
  end if;
  if p_service_id is not null and not exists (
       select 1 from public.services s where s.id = p_service_id and s.business_id = v_staff.business_id and s.deleted_at is null) then
    return jsonb_build_object('ok', false, 'code', 'unknown_service');
  end if;
  if p_kind = 'percent' and (p_percent_bp is null or p_percent_bp not between 0 and 10000
                             or p_flat_minor is not null or p_currency is not null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_percent');
  end if;
  if p_kind = 'flat' and (p_flat_minor is null or p_flat_minor not between 0 and 100000000000
                          or p_percent_bp is not null or p_currency is null or p_currency !~ '^[A-Z]{3}$') then
    return jsonb_build_object('ok', false, 'code', 'invalid_flat');
  end if;
  if p_kind = 'none' and (p_percent_bp is not null or p_flat_minor is not null or p_currency is not null) then
    return jsonb_build_object('ok', false, 'code', 'invalid_kind');
  end if;
  if v_date < date '2020-01-01' or v_date > current_date + 366 then
    return jsonb_build_object('ok', false, 'code', 'invalid_date');
  end if;

  -- All validation done. Write.
  insert into public.commission_rules
    (business_id, staff_id, service_id, kind, percent_bp, flat_minor, currency, effective_from, created_by)
  values (v_staff.business_id, p_staff_id, p_service_id, p_kind::public.commission_rule_kind,
          p_percent_bp, p_flat_minor, p_currency, v_date, auth.uid())
  returning id into v_id;
  perform public.write_audit_log(v_staff.business_id, 'commission.rule_set', 'staff', p_staff_id::text, null,
    jsonb_build_object('rule_id', v_id, 'service_id', p_service_id, 'kind', p_kind, 'percent_bp', p_percent_bp,
                       'flat_minor', p_flat_minor, 'currency', p_currency, 'effective_from', v_date));
  return jsonb_build_object('ok', true, 'rule_id', v_id);
end $$;


-- Branches the caller may see commission for, with each branch's LOCAL-date
-- window [from 00:00, to+1 00:00) in its own timezone, and whether they see
-- every staff member there (view_all) or only themselves (view_own).
create or replace function public.commission_visible_branches(
  p_business_id uuid, p_branch_id uuid, p_from date, p_to date
) returns table (branch_id uuid, tz text, w_start timestamptz, w_end timestamptz, see_all boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.timezone,
         p_from::timestamp at time zone b.timezone,
         (p_to + 1)::timestamp at time zone b.timezone,
         public.invoice_access(b.business_id, b.id, 'commission.view_all')
  from public.branches b
  where b.business_id = p_business_id and (p_branch_id is null or b.id = p_branch_id)
    and (public.invoice_access(b.business_id, b.id, 'commission.view_all')
         or public.can(b.business_id, b.id, 'commission.view_own'))
$$;
revoke all on function public.commission_visible_branches(uuid, uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: report per staff and period, per currency (never summed across
-- currencies). Dates are LOCAL dates of each branch (inclusive); the window is
-- local midnight to local midnight in that branch's timezone, so DST months
-- are exact. A caller sees every staff member of a branch where they hold
-- commission.view_all (branch/all scope), else only their own rows.
-- ---------------------------------------------------------------------------
create or replace function public.get_commission_report(
  p_business_id uuid,
  p_from date,
  p_to date,
  p_branch_id uuid default null,
  p_staff_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_gate jsonb;
  v_any boolean;
  v_rows jsonb;
  v_totals jsonb;
begin
  if (select auth.uid()) is null or not public.is_member(p_business_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  v_gate := public.feature_gate_error(p_business_id, 'commission');
  if v_gate is not null then return v_gate; end if;
  if p_from is null or p_to is null or p_from > p_to then
    return jsonb_build_object('ok', false, 'code', 'invalid_range');
  end if;
  if p_to - p_from > 366 then
    return jsonb_build_object('ok', false, 'code', 'range_too_large');
  end if;
  if p_branch_id is not null and not exists (
       select 1 from public.branches b where b.id = p_branch_id and b.business_id = p_business_id) then
    return jsonb_build_object('ok', false, 'code', 'invalid_branch');
  end if;

  select count(*) > 0 into v_any
  from public.commission_visible_branches(p_business_id, p_branch_id, p_from, p_to);
  if not v_any then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'staff_id', x.staff_id, 'staff_name', x.name, 'currency', x.currency,
      'earned_minor', x.earned, 'reversed_minor', x.reversed, 'net_minor', x.earned - x.reversed,
      'invoice_count', x.invoices) order by x.name, x.staff_id, x.currency), '[]'::jsonb)
  into v_rows
  from (
    select e.staff_id, sp.display_name as name, e.currency,
           coalesce(sum(e.amount_minor) filter (where e.kind = 'earn'), 0)::bigint as earned,
           coalesce(sum(e.amount_minor) filter (where e.kind = 'reversal'), 0)::bigint as reversed,
           count(distinct e.invoice_id)::int as invoices
    from public.commission_visible_branches(p_business_id, p_branch_id, p_from, p_to) v
    join public.commission_entries e on e.branch_id = v.branch_id and e.created_at >= v.w_start and e.created_at < v.w_end
    join public.staff_profiles sp on sp.id = e.staff_id
    where (p_staff_id is null or e.staff_id = p_staff_id)
      and (v.see_all or public.is_own_staff_profile(e.staff_id))
    group by e.staff_id, sp.display_name, e.currency
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'currency', t.currency, 'earned_minor', t.earned, 'reversed_minor', t.reversed, 'net_minor', t.earned - t.reversed)
      order by t.currency), '[]'::jsonb)
  into v_totals
  from (
    select r ->> 'currency' as currency, sum((r ->> 'earned_minor')::bigint) as earned, sum((r ->> 'reversed_minor')::bigint) as reversed
    from jsonb_array_elements(v_rows) r group by r ->> 'currency'
  ) t;

  return jsonb_build_object('ok', true, 'from', p_from, 'to', p_to, 'rows', v_rows, 'totals_by_currency', v_totals);
end $$;

revoke all on function public.set_commission_rule(uuid, uuid, text, integer, bigint, text, date) from public, anon;
revoke all on function public.get_commission_report(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.set_commission_rule(uuid, uuid, text, integer, bigint, text, date) to authenticated;
grant execute on function public.get_commission_report(uuid, date, date, uuid, uuid) to authenticated;
