-- Phase 9A fix: a reversal caused by a credit note that FULLY credits the invoice
-- (payment_status 'credited') is a 'credit_note' reversal, not 'unpaid'.
-- Found by the rounding test (full credit after a tiny partial one).
-- (20261011100000 is applied and is not edited.)

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
              v_bal - v_want, l.currency, case when v_status in ('paid', 'credited') then 'credit_note' else 'unpaid' end,
              p_payment_id, p_credit_note_id, auth.uid());
    end if;
  end loop;
end $$;
revoke all on function public.commission_sync(uuid, uuid, uuid) from public, anon, authenticated;
