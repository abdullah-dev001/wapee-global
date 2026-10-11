-- Phase 5A: invoice helpers + create/update/discard draft + issue.
--
-- Posture (same as the Phase 4 write RPCs): SECURITY DEFINER with an explicit
-- permission AND scope check as the real boundary. Every expected failure is
-- {ok:false,code}; validation finishes BEFORE the first write (CLAUDE.md §5);
-- an unexpected error raises and rolls everything back, counters included.
--
-- Permissions (doc §9): create/edit draft, issue, take payment = invoices.create;
-- any discount = invoices.discount; credit note / payment reversal =
-- invoices.credit_note; read/print/list = invoices.view. All need Branch/All
-- scope (Own does not count; Staff holds none of them anyway).

-- ---------------------------------------------------------------------------
-- Internal helpers (no grant to API roles; called from DEFINER functions)
-- ---------------------------------------------------------------------------
create or replace function public.invoice_access(p_business_id uuid, p_branch_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can(p_business_id, p_branch_id, p_permission)
     and public.has_permission_at_branch_scope(p_business_id, p_branch_id, p_permission);
$$;
revoke all on function public.invoice_access(uuid, uuid, text) from anon, authenticated, public;

-- Branch-local counters moved under a branch row lock. 6-digit zero pad that
-- never truncates (lpad would cut seq 1234567 to 123456).
create or replace function public.format_document_number(p_prefix text, p_seq bigint, p_credit boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_prefix || case when p_credit then '-CN-' else '-' end
         || repeat('0', greatest(0, 6 - length(p_seq::text))) || p_seq::text;
$$;
revoke all on function public.format_document_number(text, bigint, boolean) from anon, authenticated, public;

-- Validates and normalises a jsonb array of lines. Returns
-- {ok:true, items:[...]} or {ok:false, code}. Integers only (no floats).
create or replace function public.normalise_invoice_items(
  p_business_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_may_discount boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_elem jsonb;
  v_out jsonb := '[]'::jsonb;
  v_desc text;
  v_qty_t text;
  v_price_t text;
  v_disc_t text;
  v_reason text;
  v_service uuid;
  v_svc_name text;
  v_svc_price bigint;
  v_qty bigint;
  v_price bigint;
  v_disc bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'invalid_items');
  end if;
  if jsonb_array_length(p_items) > 100 then
    return jsonb_build_object('ok', false, 'code', 'too_many_items');
  end if;

  for v_elem in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_elem) <> 'object' then
      return jsonb_build_object('ok', false, 'code', 'invalid_items');
    end if;

    v_service := null; v_svc_name := null; v_svc_price := null;
    if nullif(v_elem->>'service_id', '') is not null then
      if (v_elem->>'service_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        return jsonb_build_object('ok', false, 'code', 'unknown_service');
      end if;
      v_service := (v_elem->>'service_id')::uuid;
      select s.name, sb.price_minor into v_svc_name, v_svc_price
      from public.services s
      left join public.service_branches sb on sb.service_id = s.id and sb.branch_id = p_branch_id
      where s.id = v_service and s.business_id = p_business_id and s.deleted_at is null;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'unknown_service');
      end if;
    end if;

    v_desc := btrim(coalesce(nullif(v_elem->>'description', ''), v_svc_name, ''));
    if char_length(v_desc) < 1 or char_length(v_desc) > 200 then
      return jsonb_build_object('ok', false, 'code', 'invalid_description');
    end if;

    v_qty_t := coalesce(v_elem->>'quantity', '1');
    if v_qty_t !~ '^[0-9]{1,4}$' or v_qty_t::bigint < 1 then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity');
    end if;
    v_qty := v_qty_t::bigint;

    v_price_t := v_elem->>'unit_price_minor';
    if v_price_t is null then
      if v_svc_price is null then
        return jsonb_build_object('ok', false, 'code', 'invalid_price');
      end if;
      v_price := v_svc_price;
    else
      if v_price_t !~ '^[0-9]{1,12}$' then
        return jsonb_build_object('ok', false, 'code', 'invalid_price');
      end if;
      v_price := v_price_t::bigint;
    end if;
    if v_price > 100000000000 then
      return jsonb_build_object('ok', false, 'code', 'invalid_price');
    end if;

    v_disc_t := coalesce(v_elem->>'discount_minor', '0');
    if v_disc_t !~ '^[0-9]{1,12}$' then
      return jsonb_build_object('ok', false, 'code', 'invalid_discount');
    end if;
    v_disc := v_disc_t::bigint;
    v_reason := nullif(btrim(coalesce(v_elem->>'discount_reason', '')), '');
    if v_disc > 0 then
      if not p_may_discount then
        return jsonb_build_object('ok', false, 'code', 'discount_forbidden');
      end if;
      if v_reason is null or char_length(v_reason) < 3 then
        return jsonb_build_object('ok', false, 'code', 'discount_reason_required');
      end if;
      if v_disc > v_qty * v_price then
        return jsonb_build_object('ok', false, 'code', 'discount_too_large');
      end if;
    else
      v_reason := null;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'service_id', v_service, 'description', v_desc, 'quantity', v_qty,
      'unit_price_minor', v_price, 'discount_minor', v_disc, 'discount_reason', v_reason));
  end loop;

  return jsonb_build_object('ok', true, 'items', v_out);
end;
$$;
revoke all on function public.normalise_invoice_items(uuid, uuid, jsonb, boolean) from anon, authenticated, public;

-- Totals for an invoice's current items at a given tax rate. Tax is computed
-- ONCE on the invoice net (after discounts), rounded half-up, in numeric so
-- nothing overflows. Tax-exclusive: total = net + tax.
create or replace function public.invoice_totals(p_invoice_id uuid, p_rate_bp integer)
returns table (subtotal bigint, discount bigint, net bigint, tax bigint, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select x.s, x.d, x.n, y.t, x.n + y.t
  from (
    select coalesce(sum(quantity::bigint * unit_price_minor), 0)::bigint as s,
           coalesce(sum(discount_minor), 0)::bigint as d,
           coalesce(sum(line_net_minor), 0)::bigint as n
    from public.invoice_items where invoice_id = p_invoice_id
  ) x,
  lateral (select floor((x.n::numeric * p_rate_bp + 5000) / 10000)::bigint as t) y;
$$;
revoke all on function public.invoice_totals(uuid, integer) from anon, authenticated, public;

create or replace function public.insert_invoice_items(
  p_invoice_id uuid, p_business_id uuid, p_branch_id uuid, p_items jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.invoice_items
    (business_id, branch_id, invoice_id, sort_order, service_id, description,
     quantity, unit_price_minor, discount_minor, discount_reason)
  select p_business_id, p_branch_id, p_invoice_id, (t.n - 1)::int,
         nullif(t.e->>'service_id', '')::uuid, t.e->>'description',
         (t.e->>'quantity')::int, (t.e->>'unit_price_minor')::bigint,
         (t.e->>'discount_minor')::bigint, t.e->>'discount_reason'
  from jsonb_array_elements(p_items) with ordinality as t(e, n);
$$;
revoke all on function public.insert_invoice_items(uuid, uuid, uuid, jsonb) from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- create_invoice_draft
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_draft(
  p_branch_id uuid default null,
  p_appointment_id uuid default null,
  p_client_id uuid default null,
  p_items jsonb default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt record;
  v_branch record;
  v_business uuid;
  v_branch_id uuid := p_branch_id;
  v_client uuid := p_client_id;
  v_client_name text;
  v_items jsonb := p_items;
  v_norm jsonb;
  v_invoice_id uuid;
  v_t record;
  v_price bigint;
  v_svc_name text;
begin
  if p_appointment_id is not null then
    select a.id, a.business_id, a.branch_id, a.client_id, a.service_id, a.status,
           a.price_minor, a.invoice_id
    into v_appt
    from public.appointments a
    where a.id = p_appointment_id and a.deleted_at is null
    for update of a;
    if v_appt.id is null then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    if p_branch_id is not null and p_branch_id <> v_appt.branch_id then
      return jsonb_build_object('ok', false, 'code', 'branch_mismatch');
    end if;
    v_branch_id := v_appt.branch_id;
    v_business := v_appt.business_id;
  else
    if p_branch_id is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_branch');
    end if;
    select b.business_id into v_business
    from public.branches b where b.id = p_branch_id and b.deleted_at is null;
    if v_business is null then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
  end if;

  if not public.invoice_access(v_business, v_branch_id, 'invoices.create') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select b.currency, b.tax_rate_bp, b.tax_number into v_branch
  from public.branches b where b.id = v_branch_id and b.deleted_at is null;
  if v_branch.currency is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if p_appointment_id is not null then
    if v_appt.status <> 'completed' then
      return jsonb_build_object('ok', false, 'code', 'not_completed');
    end if;
    if v_appt.invoice_id is not null
       or exists (select 1 from public.invoices i
                  where i.appointment_id = p_appointment_id and i.deleted_at is null) then
      return jsonb_build_object('ok', false, 'code', 'already_invoiced');
    end if;
    if p_client_id is not null and p_client_id <> v_appt.client_id then
      return jsonb_build_object('ok', false, 'code', 'client_mismatch');
    end if;
    v_client := v_appt.client_id;
    if v_items is null then
      select s.name, sb.price_minor into v_svc_name, v_price
      from public.services s
      left join public.service_branches sb on sb.service_id = s.id and sb.branch_id = v_branch_id
      where s.id = v_appt.service_id;
      v_items := jsonb_build_array(jsonb_build_object(
        'service_id', v_appt.service_id, 'description', coalesce(v_svc_name, 'Service'),
        'quantity', 1, 'unit_price_minor', coalesce(v_appt.price_minor, v_price, 0)));
    end if;
  end if;

  if v_client is not null then
    select c.full_name into v_client_name
    from public.clients c
    where c.id = v_client and c.business_id = v_business and c.deleted_at is null;
    if v_client_name is null then
      return jsonb_build_object('ok', false, 'code', 'unknown_client');
    end if;
  end if;

  v_norm := public.normalise_invoice_items(
    v_business, v_branch_id, coalesce(v_items, '[]'::jsonb),
    public.invoice_access(v_business, v_branch_id, 'invoices.discount'));
  if not (v_norm->>'ok')::boolean then
    return v_norm;
  end if;

  -- All validation done. Write.
  begin
    insert into public.invoices
      (business_id, branch_id, client_id, appointment_id, currency, tax_rate_bp, tax_number,
       bill_to_name, notes, created_by)
    values
      (v_business, v_branch_id, v_client, p_appointment_id, v_branch.currency,
       v_branch.tax_rate_bp, v_branch.tax_number, v_client_name,
       nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
    returning id into v_invoice_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'already_invoiced');
  end;

  perform public.insert_invoice_items(v_invoice_id, v_business, v_branch_id, v_norm->'items');

  select * into v_t from public.invoice_totals(v_invoice_id, v_branch.tax_rate_bp);
  update public.invoices
  set subtotal_minor = v_t.subtotal, discount_minor = v_t.discount, net_minor = v_t.net,
      tax_minor = v_t.tax, total_minor = v_t.total
  where id = v_invoice_id;

  if p_appointment_id is not null then
    perform set_config('wapee.invoice_link', 'on', true);
    update public.appointments set invoice_id = v_invoice_id where id = p_appointment_id;
    perform set_config('wapee.invoice_link', 'off', true);
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice_id, 'status', 'draft',
    'subtotal_minor', v_t.subtotal, 'discount_minor', v_t.discount, 'net_minor', v_t.net,
    'tax_minor', v_t.tax, 'total_minor', v_t.total);
end;
$$;

comment on function public.create_invoice_draft is
  'Creates a DRAFT invoice (free-text/service lines, or prefilled from a COMPLETED appointment). Links appointments.invoice_id. DEFINER, invoices.create at branch scope; discounts need invoices.discount.';

-- ---------------------------------------------------------------------------
-- update_invoice_draft  (null = unchanged; items, when given, replace all lines)
-- ---------------------------------------------------------------------------
create or replace function public.update_invoice_draft(
  p_invoice_id uuid,
  p_items jsonb default null,
  p_client_id uuid default null,
  p_clear_client boolean default false,
  p_notes text default null,
  p_clear_notes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_branch record;
  v_norm jsonb;
  v_client uuid;
  v_client_name text;
  v_set_client boolean := false;
  v_t record;
begin
  select i.id, i.business_id, i.branch_id, i.status, i.deleted_at, i.client_id, i.appointment_id
  into v_inv
  from public.invoices i where i.id = p_invoice_id for update;
  if v_inv.id is null or v_inv.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.create') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_inv.status <> 'draft' then
    return jsonb_build_object('ok', false, 'code', 'not_draft');
  end if;

  if p_client_id is not null or p_clear_client then
    if v_inv.appointment_id is not null then
      return jsonb_build_object('ok', false, 'code', 'client_mismatch');
    end if;
    v_set_client := true;
    if p_client_id is not null and not p_clear_client then
      select c.full_name into v_client_name
      from public.clients c
      where c.id = p_client_id and c.business_id = v_inv.business_id and c.deleted_at is null;
      if v_client_name is null then
        return jsonb_build_object('ok', false, 'code', 'unknown_client');
      end if;
      v_client := p_client_id;
    end if;
  end if;

  if p_items is not null then
    v_norm := public.normalise_invoice_items(
      v_inv.business_id, v_inv.branch_id, p_items,
      public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.discount'));
    if not (v_norm->>'ok')::boolean then
      return v_norm;
    end if;
  end if;

  -- All validation done. Write.
  select b.tax_rate_bp, b.tax_number into v_branch from public.branches b where b.id = v_inv.branch_id;

  if p_items is not null then
    delete from public.invoice_items where invoice_id = p_invoice_id;
    perform public.insert_invoice_items(p_invoice_id, v_inv.business_id, v_inv.branch_id, v_norm->'items');
  end if;
  select * into v_t from public.invoice_totals(p_invoice_id, v_branch.tax_rate_bp);

  update public.invoices
  set client_id = case when v_set_client then v_client else client_id end,
      bill_to_name = case when v_set_client then v_client_name else bill_to_name end,
      notes = case when p_clear_notes then null
                   when p_notes is not null then nullif(btrim(p_notes), '')
                   else notes end,
      tax_rate_bp = v_branch.tax_rate_bp, tax_number = v_branch.tax_number,
      subtotal_minor = v_t.subtotal, discount_minor = v_t.discount, net_minor = v_t.net,
      tax_minor = v_t.tax, total_minor = v_t.total
  where id = p_invoice_id;

  return jsonb_build_object('ok', true, 'invoice_id', p_invoice_id, 'status', 'draft',
    'subtotal_minor', v_t.subtotal, 'discount_minor', v_t.discount, 'net_minor', v_t.net,
    'tax_minor', v_t.tax, 'total_minor', v_t.total);
end;
$$;

comment on function public.update_invoice_draft is
  'Edits a DRAFT only: replaces lines when p_items is given, changes client/notes. Validates fully before the first write. DEFINER, invoices.create.';

-- ---------------------------------------------------------------------------
-- discard_invoice_draft  (soft delete; frees the appointment)
-- ---------------------------------------------------------------------------
create or replace function public.discard_invoice_draft(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
begin
  select i.id, i.business_id, i.branch_id, i.status, i.deleted_at, i.appointment_id
  into v_inv from public.invoices i where i.id = p_invoice_id for update;
  if v_inv.id is null or v_inv.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.create') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_inv.status <> 'draft' then
    return jsonb_build_object('ok', false, 'code', 'not_draft');
  end if;

  update public.invoices set deleted_at = now() where id = p_invoice_id;

  if v_inv.appointment_id is not null then
    perform set_config('wapee.invoice_link', 'on', true);
    update public.appointments set invoice_id = null
    where id = v_inv.appointment_id and invoice_id = p_invoice_id;
    perform set_config('wapee.invoice_link', 'off', true);
  end if;

  perform public.write_audit_log(
    v_inv.business_id, 'invoice.draft_discarded', 'invoice', p_invoice_id::text,
    jsonb_build_object('status', 'draft'), jsonb_build_object('deleted', true));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_invoice: draft -> issued. Numbered under the branch row lock.
-- Order matters: lock invoice, lock branch (NO KEY UPDATE: it serialises
-- issuers but does not block FK checks that only take KEY SHARE), validate
-- EVERYTHING, then write number+invoice. A failure anywhere rolls the counter
-- back with it, so numbers never gap.
-- ---------------------------------------------------------------------------
create or replace function public.issue_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_branch record;
  v_t record;
  v_seq bigint;
  v_number text;
  v_items int;
  v_issued_at timestamptz := now();
begin
  select i.id, i.business_id, i.branch_id, i.status, i.deleted_at, i.currency
  into v_inv from public.invoices i where i.id = p_invoice_id for update;
  if v_inv.id is null or v_inv.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.create') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_inv.status <> 'draft' then
    return jsonb_build_object('ok', false, 'code', 'not_draft');
  end if;

  select b.id, b.invoice_prefix, b.invoice_next_no, b.tax_rate_bp, b.tax_number, b.currency
  into v_branch
  from public.branches b where b.id = v_inv.branch_id for no key update;

  if v_branch.currency <> v_inv.currency then
    return jsonb_build_object('ok', false, 'code', 'currency_changed');
  end if;

  select count(*) into v_items from public.invoice_items where invoice_id = p_invoice_id;
  if v_items = 0 then
    return jsonb_build_object('ok', false, 'code', 'no_items');
  end if;

  -- Tax rate/number are snapshotted from the branch NOW.
  select * into v_t from public.invoice_totals(p_invoice_id, v_branch.tax_rate_bp);
  if v_t.total <= 0 then
    return jsonb_build_object('ok', false, 'code', 'zero_total');
  end if;

  v_seq := v_branch.invoice_next_no;
  v_number := public.format_document_number(v_branch.invoice_prefix, v_seq, false);

  -- All validation done. Write (number counter + the invoice).
  perform set_config('wapee.numbering', 'on', true);
  update public.branches set invoice_next_no = v_seq + 1 where id = v_inv.branch_id;
  perform set_config('wapee.numbering', 'off', true);

  update public.invoices
  set status = 'issued', number = v_number, number_seq = v_seq, issued_at = v_issued_at,
      issued_by = auth.uid(), tax_rate_bp = v_branch.tax_rate_bp, tax_number = v_branch.tax_number,
      subtotal_minor = v_t.subtotal, discount_minor = v_t.discount, net_minor = v_t.net,
      tax_minor = v_t.tax, total_minor = v_t.total
  where id = p_invoice_id;

  perform public.write_audit_log(
    v_inv.business_id, 'invoice.issued', 'invoice', p_invoice_id::text,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'issued', 'number', v_number, 'currency', v_inv.currency,
                       'total_minor', v_t.total, 'tax_minor', v_t.tax));

  return jsonb_build_object('ok', true, 'invoice_id', p_invoice_id, 'number', v_number,
    'issued_at', v_issued_at, 'currency', v_inv.currency, 'net_minor', v_t.net,
    'tax_minor', v_t.tax, 'total_minor', v_t.total);
end;
$$;

comment on function public.issue_invoice is
  'Draft -> issued. Assigns <prefix>-<seq> gapless under the branch row lock, snapshots tax rate/number, makes the invoice immutable. DEFINER, invoices.create.';

-- ---------------------------------------------------------------------------
-- Grants: authenticated only (anon gets nothing; Supabase grants EXECUTE to
-- anon by default, so revoke it explicitly).
-- ---------------------------------------------------------------------------
revoke all on function public.create_invoice_draft(uuid, uuid, uuid, jsonb, text) from anon, public;
revoke all on function public.update_invoice_draft(uuid, jsonb, uuid, boolean, text, boolean) from anon, public;
revoke all on function public.discard_invoice_draft(uuid) from anon, public;
revoke all on function public.issue_invoice(uuid) from anon, public;
grant execute on function public.create_invoice_draft(uuid, uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.update_invoice_draft(uuid, jsonb, uuid, boolean, text, boolean) to authenticated;
grant execute on function public.discard_invoice_draft(uuid) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
