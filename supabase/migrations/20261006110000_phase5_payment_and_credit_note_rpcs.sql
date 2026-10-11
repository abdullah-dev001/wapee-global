-- Phase 5A: add_payment, reverse_payment, create_credit_note.
--
-- All DEFINER, explicit permission + scope check, validate-then-write, every
-- expected failure returned as {ok:false,code}. Each locks the INVOICE row
-- (select ... for update) so two concurrent payments cannot both pass the
-- "not more than the balance" check. Rows are append-only (guard triggers).
--
-- Money model (all computed, never stored):
--   credited = sum(credit_notes.total)        net_due = invoice.total - credited
--   paid     = sum(payments) - sum(reversals)
--   balance  = net_due - paid   refund_due = max(paid - net_due, 0)
--   payment_status: credited (net_due = 0) | pending (paid = 0) |
--                   partial (paid < net_due) | paid

-- Single source of the computed money, used by the RPCs below and the read RPCs.
create or replace function public.invoice_money(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'paid_minor', m.paid,
    'credited_minor', m.credited,
    'net_due_minor', m.net_due,
    'balance_minor', greatest(m.net_due - m.paid, 0),
    'refund_due_minor', greatest(m.paid - m.net_due, 0),
    'payment_status', case
      when i.status = 'draft' then null
      when m.net_due <= 0 then 'credited'
      when m.paid <= 0 then 'pending'
      when m.paid < m.net_due then 'partial'
      else 'paid' end)
  from public.invoices i,
  lateral (
    select
      coalesce((select sum(case when p.kind = 'payment' then p.amount_minor else -p.amount_minor end)
                from public.invoice_payments p where p.invoice_id = i.id), 0)::bigint as paid,
      coalesce((select sum(c.total_minor) from public.credit_notes c where c.invoice_id = i.id), 0)::bigint as credited
  ) s,
  lateral (select s.paid, s.credited, i.total_minor - s.credited as net_due) m
  where i.id = p_invoice_id;
$$;
revoke all on function public.invoice_money(uuid) from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- add_payment
-- ---------------------------------------------------------------------------
create or replace function public.add_payment(
  p_invoice_id uuid,
  p_method text,
  p_amount_minor bigint,
  p_paid_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_money jsonb;
  v_paid_at timestamptz;
  v_payment_id uuid;
begin
  select i.id, i.business_id, i.branch_id, i.status, i.deleted_at, i.currency, i.issued_at
  into v_inv from public.invoices i where i.id = p_invoice_id for update;
  if v_inv.id is null or v_inv.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.create') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_inv.status <> 'issued' then
    return jsonb_build_object('ok', false, 'code', 'not_issued');
  end if;
  if p_method is null or p_method not in ('cash', 'card', 'bank_transfer') then
    return jsonb_build_object('ok', false, 'code', 'invalid_method');
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;
  v_paid_at := coalesce(p_paid_at, now());
  if v_paid_at > now() + interval '5 minutes' or v_paid_at < v_inv.issued_at then
    return jsonb_build_object('ok', false, 'code', 'invalid_paid_at');
  end if;

  v_money := public.invoice_money(p_invoice_id);
  if (v_money->>'net_due_minor')::bigint <= 0 then
    return jsonb_build_object('ok', false, 'code', 'fully_credited');
  end if;
  if p_amount_minor > (v_money->>'balance_minor')::bigint then
    return jsonb_build_object('ok', false, 'code', 'overpayment',
      'balance_minor', (v_money->>'balance_minor')::bigint);
  end if;

  -- All validation done. Write.
  insert into public.invoice_payments
    (business_id, branch_id, invoice_id, kind, method, amount_minor, currency, paid_at, note, created_by)
  values
    (v_inv.business_id, v_inv.branch_id, p_invoice_id, 'payment', p_method::public.invoice_payment_method,
     p_amount_minor, v_inv.currency, v_paid_at, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_payment_id;

  v_money := public.invoice_money(p_invoice_id);
  perform public.write_audit_log(
    v_inv.business_id, 'invoice.payment_added', 'invoice', p_invoice_id::text, null,
    jsonb_build_object('payment_id', v_payment_id, 'method', p_method, 'amount_minor', p_amount_minor,
                       'currency', v_inv.currency));

  return jsonb_build_object('ok', true, 'payment_id', v_payment_id) || v_money;
end;
$$;

comment on function public.add_payment is
  'Manual payment (cash/card/bank_transfer) on an ISSUED invoice; never above the balance. DEFINER, invoices.create. Append-only.';

-- ---------------------------------------------------------------------------
-- reverse_payment  (the refund path: a new row, partial allowed)
-- ---------------------------------------------------------------------------
create or replace function public.reverse_payment(
  p_payment_id uuid,
  p_reason text,
  p_amount_minor bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay record;
  v_inv record;
  v_already bigint;
  v_amount bigint;
  v_reversal_id uuid;
  v_money jsonb;
begin
  select p.id, p.invoice_id, p.kind, p.method, p.amount_minor into v_pay
  from public.invoice_payments p where p.id = p_payment_id;
  if v_pay.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select i.id, i.business_id, i.branch_id, i.currency into v_inv
  from public.invoices i where i.id = v_pay.invoice_id for update;

  if not public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.credit_note') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_pay.kind <> 'payment' then
    return jsonb_build_object('ok', false, 'code', 'not_a_payment');
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  select coalesce(sum(r.amount_minor), 0) into v_already
  from public.invoice_payments r where r.reverses_payment_id = p_payment_id;
  v_amount := coalesce(p_amount_minor, v_pay.amount_minor - v_already);
  if v_amount <= 0 or v_amount > v_pay.amount_minor - v_already then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount',
      'reversible_minor', v_pay.amount_minor - v_already);
  end if;

  -- All validation done. Write.
  insert into public.invoice_payments
    (business_id, branch_id, invoice_id, kind, method, amount_minor, currency,
     reverses_payment_id, reason, created_by)
  values
    (v_inv.business_id, v_inv.branch_id, v_pay.invoice_id, 'reversal', v_pay.method, v_amount,
     v_inv.currency, p_payment_id, btrim(p_reason), auth.uid())
  returning id into v_reversal_id;

  v_money := public.invoice_money(v_pay.invoice_id);
  perform public.write_audit_log(
    v_inv.business_id, 'invoice.payment_reversed', 'invoice', v_pay.invoice_id::text, null,
    jsonb_build_object('reversal_id', v_reversal_id, 'payment_id', p_payment_id,
                       'amount_minor', v_amount, 'reason', btrim(p_reason)));

  return jsonb_build_object('ok', true, 'reversal_id', v_reversal_id) || v_money;
end;
$$;

comment on function public.reverse_payment is
  'Reverses (all or part of) a payment with a NEW reversal row; reason required. DEFINER, invoices.credit_note (Owner/Manager).';

-- ---------------------------------------------------------------------------
-- create_credit_note  (full when p_net_minor is null, otherwise partial)
-- Amounts are on the pre-tax NET. Tax follows the invoice's snapshotted rate;
-- the credit that exhausts the remaining net takes the remaining tax exactly,
-- so full + partials always add back to the invoice with no rounding drift.
-- ---------------------------------------------------------------------------
create or replace function public.create_credit_note(
  p_invoice_id uuid,
  p_reason text,
  p_net_minor bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_branch record;
  v_cn_net bigint;
  v_cn_tax bigint;
  v_rem_net bigint;
  v_rem_tax bigint;
  v_net bigint;
  v_tax bigint;
  v_seq bigint;
  v_number text;
  v_cn_id uuid;
  v_issued_at timestamptz := now();
begin
  select i.id, i.business_id, i.branch_id, i.status, i.deleted_at, i.currency, i.tax_rate_bp,
         i.net_minor, i.tax_minor
  into v_inv from public.invoices i where i.id = p_invoice_id for update;
  if v_inv.id is null or v_inv.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.credit_note') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v_inv.status <> 'issued' then
    return jsonb_build_object('ok', false, 'code', 'not_issued');
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  select coalesce(sum(c.net_minor), 0), coalesce(sum(c.tax_minor), 0) into v_cn_net, v_cn_tax
  from public.credit_notes c where c.invoice_id = p_invoice_id;
  v_rem_net := v_inv.net_minor - v_cn_net;
  v_rem_tax := v_inv.tax_minor - v_cn_tax;
  if v_rem_net <= 0 then
    return jsonb_build_object('ok', false, 'code', 'fully_credited');
  end if;

  v_net := coalesce(p_net_minor, v_rem_net);
  if v_net <= 0 or v_net > v_rem_net then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount', 'creditable_net_minor', v_rem_net);
  end if;
  if v_net = v_rem_net then
    v_tax := v_rem_tax;
  else
    v_tax := least(floor((v_net::numeric * v_inv.tax_rate_bp + 5000) / 10000)::bigint, v_rem_tax);
  end if;

  select b.invoice_prefix, b.credit_note_next_no into v_branch
  from public.branches b where b.id = v_inv.branch_id for no key update;
  v_seq := v_branch.credit_note_next_no;
  v_number := public.format_document_number(v_branch.invoice_prefix, v_seq, true);

  -- All validation done. Write.
  perform set_config('wapee.numbering', 'on', true);
  update public.branches set credit_note_next_no = v_seq + 1 where id = v_inv.branch_id;
  perform set_config('wapee.numbering', 'off', true);

  insert into public.credit_notes
    (business_id, branch_id, invoice_id, number, number_seq, currency, tax_rate_bp,
     net_minor, tax_minor, total_minor, reason, issued_at, created_by)
  values
    (v_inv.business_id, v_inv.branch_id, p_invoice_id, v_number, v_seq, v_inv.currency,
     v_inv.tax_rate_bp, v_net, v_tax, v_net + v_tax, btrim(p_reason), v_issued_at, auth.uid())
  returning id into v_cn_id;

  perform public.write_audit_log(
    v_inv.business_id, 'invoice.credit_note_created', 'invoice', p_invoice_id::text, null,
    jsonb_build_object('credit_note_id', v_cn_id, 'number', v_number, 'net_minor', v_net,
                       'tax_minor', v_tax, 'currency', v_inv.currency, 'reason', btrim(p_reason)));

  return jsonb_build_object('ok', true, 'credit_note_id', v_cn_id, 'number', v_number,
    'net_minor', v_net, 'tax_minor', v_tax, 'total_minor', v_net + v_tax) || public.invoice_money(p_invoice_id);
end;
$$;

comment on function public.create_credit_note is
  'Full (net null) or partial credit note on an ISSUED invoice, own gapless series <prefix>-CN-<n>. Surplus already paid becomes refund_due, cleared by reverse_payment. DEFINER, invoices.credit_note.';

revoke all on function public.add_payment(uuid, text, bigint, timestamptz, text) from anon, public;
revoke all on function public.reverse_payment(uuid, text, bigint) from anon, public;
revoke all on function public.create_credit_note(uuid, text, bigint) from anon, public;
grant execute on function public.add_payment(uuid, text, bigint, timestamptz, text) to authenticated;
grant execute on function public.reverse_payment(uuid, text, bigint) to authenticated;
grant execute on function public.create_credit_note(uuid, text, bigint) to authenticated;
