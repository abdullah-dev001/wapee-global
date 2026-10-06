-- Phase 10A (3/4): the invoice integration. Package/product lines in normalise_invoice_items +
-- insert_invoice_items; issue_invoice sells packages and deducts stock; create_credit_note cancels
-- unused packages and restores stock when the credit exhausts the invoice net. Every check happens
-- before the first write (CLAUDE.md section 5).

CREATE OR REPLACE FUNCTION public.normalise_invoice_items(p_business_id uuid, p_branch_id uuid, p_items jsonb, p_may_discount boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
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
  v_package uuid;
  v_product uuid;
  v_gate jsonb;
  v_n_src integer;
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

    -- Phase 10: a line may instead sell a PACKAGE or a PRODUCT (never more than one source).
    v_package := null; v_product := null;
    v_n_src := (nullif(v_elem->>'service_id', '') is not null)::int
             + (nullif(v_elem->>'package_id', '') is not null)::int
             + (nullif(v_elem->>'product_id', '') is not null)::int;
    if v_n_src > 1 then
      return jsonb_build_object('ok', false, 'code', 'invalid_items');
    end if;
    if nullif(v_elem->>'package_id', '') is not null then
      if (v_elem->>'package_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        return jsonb_build_object('ok', false, 'code', 'unknown_package');
      end if;
      v_package := (v_elem->>'package_id')::uuid;
      if not public.addon_access(p_business_id, p_branch_id, 'packages.sell') then
        return jsonb_build_object('ok', false, 'code', 'forbidden');
      end if;
      v_gate := public.feature_gate_error(p_business_id, 'packages');
      if v_gate is not null then return v_gate; end if;
      select p.name, p.price_minor into v_svc_name, v_svc_price
      from public.packages p
      where p.id = v_package and p.business_id = p_business_id and p.branch_id = p_branch_id
        and p.deleted_at is null and p.is_active;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'unknown_package');
      end if;
    elsif nullif(v_elem->>'product_id', '') is not null then
      if (v_elem->>'product_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        return jsonb_build_object('ok', false, 'code', 'unknown_product');
      end if;
      v_product := (v_elem->>'product_id')::uuid;
      v_gate := public.feature_gate_error(p_business_id, 'inventory');
      if v_gate is not null then return v_gate; end if;
      select p.name, p.price_minor into v_svc_name, v_svc_price
      from public.products p
      where p.id = v_product and p.business_id = p_business_id and p.branch_id = p_branch_id
        and p.deleted_at is null and p.is_active;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'unknown_product');
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
    if v_package is not null and v_qty <> 1 then
      return jsonb_build_object('ok', false, 'code', 'package_quantity');
    end if;

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
      'service_id', v_service, 'package_id', v_package, 'product_id', v_product, 'description', v_desc, 'quantity', v_qty,
      'unit_price_minor', v_price, 'discount_minor', v_disc, 'discount_reason', v_reason));
  end loop;

  return jsonb_build_object('ok', true, 'items', v_out);
end;
$fn$;

CREATE OR REPLACE FUNCTION public.insert_invoice_items(p_invoice_id uuid, p_business_id uuid, p_branch_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
  insert into public.invoice_items
    (business_id, branch_id, invoice_id, sort_order, service_id, package_id, product_id, description,
     quantity, unit_price_minor, discount_minor, discount_reason)
  select p_business_id, p_branch_id, p_invoice_id, (t.n - 1)::int,
         nullif(t.e->>'service_id', '')::uuid, nullif(t.e->>'package_id', '')::uuid,
         nullif(t.e->>'product_id', '')::uuid, t.e->>'description',
         (t.e->>'quantity')::int, (t.e->>'unit_price_minor')::bigint,
         (t.e->>'discount_minor')::bigint, t.e->>'discount_reason'
  from jsonb_array_elements(p_items) with ordinality as t(e, n);
$fn$;

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
declare
  v_inv record;
  v_branch record;
  v_t record;
  v_seq bigint;
  v_number text;
  v_items int;
  v_issued_at timestamptz := now();
  v_line record;
  v_prod record;
  v_allow boolean;
  v_gate jsonb;
  v_expires timestamptz;
  v_cp uuid;
begin
  select i.id, i.business_id, i.branch_id, i.status, i.deleted_at, i.currency, i.client_id
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

  select b.id, b.invoice_prefix, b.invoice_next_no, b.tax_rate_bp, b.tax_number, b.currency, b.timezone
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

  -- Phase 10: package and product lines. Everything is checked BEFORE the first write.
  if exists (select 1 from public.invoice_items it where it.invoice_id = p_invoice_id and it.package_id is not null) then
    v_gate := public.feature_gate_error(v_inv.business_id, 'packages');
    if v_gate is not null then return v_gate; end if;
    if v_inv.client_id is null then
      return jsonb_build_object('ok', false, 'code', 'client_required_for_package');
    end if;
    if exists (select 1 from public.invoice_items it
               where it.invoice_id = p_invoice_id and it.package_id is not null
                 and not exists (select 1 from public.packages p
                                 where p.id = it.package_id and p.deleted_at is null and p.is_active
                                   and p.business_id = v_inv.business_id and p.branch_id = v_inv.branch_id)) then
      return jsonb_build_object('ok', false, 'code', 'unknown_package');
    end if;
  end if;
  if exists (select 1 from public.invoice_items it where it.invoice_id = p_invoice_id and it.product_id is not null) then
    v_gate := public.feature_gate_error(v_inv.business_id, 'inventory');
    if v_gate is not null then return v_gate; end if;
    -- lock the products in id order (the branch row is already locked, so issuers queue there first)
    perform 1 from public.products p
    where p.id in (select it.product_id from public.invoice_items it where it.invoice_id = p_invoice_id and it.product_id is not null)
    order by p.id for update;
    select coalesce((select s.allow_negative_stock from public.inventory_settings s where s.branch_id = v_inv.branch_id), false) into v_allow;
    for v_prod in
      select it.product_id, sum(it.quantity)::integer as qty, p.stock_qty, p.deleted_at, p.is_active, p.business_id, p.branch_id
      from public.invoice_items it join public.products p on p.id = it.product_id
      where it.invoice_id = p_invoice_id and it.product_id is not null
      group by it.product_id, p.stock_qty, p.deleted_at, p.is_active, p.business_id, p.branch_id
    loop
      if v_prod.deleted_at is not null or not v_prod.is_active
         or v_prod.business_id <> v_inv.business_id or v_prod.branch_id <> v_inv.branch_id then
        return jsonb_build_object('ok', false, 'code', 'unknown_product', 'product_id', v_prod.product_id);
      end if;
      if v_prod.stock_qty < v_prod.qty and not v_allow then
        return jsonb_build_object('ok', false, 'code', 'insufficient_stock', 'product_id', v_prod.product_id,
                                  'stock', v_prod.stock_qty, 'requested', v_prod.qty);
      end if;
    end loop;
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

  -- Packages sold: one client_package per package line (a snapshot of the definition).
  for v_line in
    select it.id as item_id, it.package_id, it.line_net_minor, p.name, p.sessions, p.bonus_sessions, p.expiry_days
    from public.invoice_items it join public.packages p on p.id = it.package_id
    where it.invoice_id = p_invoice_id and it.package_id is not null
    order by it.sort_order
  loop
    v_expires := case when v_line.expiry_days is null then null
      else (((v_issued_at at time zone v_branch.timezone)::date + v_line.expiry_days + 1)::timestamp) at time zone v_branch.timezone end;
    insert into public.client_packages
      (business_id, branch_id, client_id, package_id, invoice_id, invoice_item_id, name, sessions_purchased,
       sessions_bonus, price_minor, currency, sold_at, expires_at, created_by)
    values
      (v_inv.business_id, v_inv.branch_id, v_inv.client_id, v_line.package_id, p_invoice_id, v_line.item_id, v_line.name,
       v_line.sessions, v_line.bonus_sessions, v_line.line_net_minor, v_inv.currency, v_issued_at, v_expires, auth.uid())
    returning id into v_cp;
    insert into public.client_package_services (client_package_id, service_id, business_id)
    select v_cp, ps.service_id, v_inv.business_id from public.package_services ps where ps.package_id = v_line.package_id;
    perform public.write_audit_log(v_inv.business_id, 'package.sold', 'client_package', v_cp::text, null,
      jsonb_build_object('invoice_id', p_invoice_id, 'package_id', v_line.package_id, 'name', v_line.name,
                         'sessions', v_line.sessions, 'bonus_sessions', v_line.bonus_sessions,
                         'price_minor', v_line.line_net_minor, 'currency', v_inv.currency, 'expires_at', v_expires));
  end loop;

  -- Products sold: stock drops now (the product rows are locked and checked above).
  for v_line in
    select it.id as item_id, it.product_id, it.quantity
    from public.invoice_items it
    where it.invoice_id = p_invoice_id and it.product_id is not null
    order by it.sort_order
  loop
    insert into public.stock_movements
      (business_id, branch_id, product_id, kind, quantity, stock_after, invoice_id, invoice_item_id, created_by)
    values
      (v_inv.business_id, v_inv.branch_id, v_line.product_id, 'sale', -v_line.quantity, 0, p_invoice_id, v_line.item_id, auth.uid());
  end loop;

  perform public.write_audit_log(
    v_inv.business_id, 'invoice.issued', 'invoice', p_invoice_id::text,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'issued', 'number', v_number, 'currency', v_inv.currency,
                       'total_minor', v_t.total, 'tax_minor', v_t.tax));

  return jsonb_build_object('ok', true, 'invoice_id', p_invoice_id, 'number', v_number,
    'issued_at', v_issued_at, 'currency', v_inv.currency, 'net_minor', v_t.net,
    'tax_minor', v_t.tax, 'total_minor', v_t.total);
end;
$fn$;

CREATE OR REPLACE FUNCTION public.create_credit_note(p_invoice_id uuid, p_reason text, p_net_minor bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
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
  v_line record;
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

  -- Phase 10: the credit that EXHAUSTS the invoice net cancels its packages (only if no session was
  -- used) and restores its product lines. Checked before the first write; a partial credit does neither.
  if v_net = v_rem_net then
    if exists (select 1 from public.client_packages cp
               where cp.invoice_id = p_invoice_id
                 and not exists (select 1 from public.client_package_cancellations x where x.client_package_id = cp.id)
                 and public.client_package_used(cp.id) > 0) then
      return jsonb_build_object('ok', false, 'code', 'package_sessions_used');
    end if;
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

  if v_net = v_rem_net then
    for v_line in
      select cp.id from public.client_packages cp
      where cp.invoice_id = p_invoice_id
        and not exists (select 1 from public.client_package_cancellations x where x.client_package_id = cp.id)
    loop
      insert into public.client_package_cancellations (client_package_id, business_id, credit_note_id, created_by)
      values (v_line.id, v_inv.business_id, v_cn_id, auth.uid());
      perform public.write_audit_log(v_inv.business_id, 'package.cancelled', 'client_package', v_line.id::text, null,
        jsonb_build_object('invoice_id', p_invoice_id, 'credit_note_id', v_cn_id));
    end loop;
    for v_line in
      select m.invoice_item_id, m.product_id, -m.quantity as qty
      from public.stock_movements m
      where m.invoice_id = p_invoice_id and m.kind = 'sale'
        and not exists (select 1 from public.stock_movements r
                        where r.invoice_item_id = m.invoice_item_id and r.kind = 'return' and r.credit_note_id is not null)
      order by m.product_id, m.invoice_item_id
    loop
      insert into public.stock_movements
        (business_id, branch_id, product_id, kind, quantity, stock_after, reason, invoice_id, invoice_item_id, credit_note_id, created_by)
      values
        (v_inv.business_id, v_inv.branch_id, v_line.product_id, 'return', v_line.qty, 0, 'Credit note ' || v_number,
         p_invoice_id, v_line.invoice_item_id, v_cn_id, auth.uid());
    end loop;
  end if;

  perform public.write_audit_log(
    v_inv.business_id, 'invoice.credit_note_created', 'invoice', p_invoice_id::text, null,
    jsonb_build_object('credit_note_id', v_cn_id, 'number', v_number, 'net_minor', v_net,
                       'tax_minor', v_tax, 'currency', v_inv.currency, 'reason', btrim(p_reason)));

  return jsonb_build_object('ok', true, 'credit_note_id', v_cn_id, 'number', v_number,
    'net_minor', v_net, 'tax_minor', v_tax, 'total_minor', v_net + v_tax) || public.invoice_money(p_invoice_id);
end;
$fn$;

