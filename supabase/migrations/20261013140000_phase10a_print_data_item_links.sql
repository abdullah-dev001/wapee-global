-- Phase 10A: a draft invoice line that sells a package or a product must come back from
-- get_invoice_print_data with its package_id / product_id, or editing the draft would silently turn it
-- into a free-text line (and the package would never be sold at issue).
CREATE OR REPLACE FUNCTION public.get_invoice_print_data(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
declare
  v_inv public.invoices%rowtype;
  v_branch record;
  v_business record;
  v_client jsonb := null;
  v_contact boolean;
begin
  select * into v_inv from public.invoices i where i.id = p_invoice_id and i.deleted_at is null;
  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if not public.invoice_access(v_inv.business_id, v_inv.branch_id, 'invoices.view') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select b.name, b.address, b.phone, b.country_code, b.timezone, b.currency
  into v_branch from public.branches b where b.id = v_inv.branch_id;
  select bz.name into v_business from public.businesses bz where bz.id = v_inv.business_id;

  if v_inv.client_id is not null then
    v_contact := public.can(v_inv.business_id, v_inv.branch_id, 'clients.view_contact');
    select jsonb_build_object('id', c.id, 'name', c.full_name,
             'phone', case when v_contact then c.phone_e164 end,
             'email', case when v_contact then c.email::text end)
    into v_client from public.clients c where c.id = v_inv.client_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'invoice', jsonb_build_object(
      'id', v_inv.id, 'status', v_inv.status, 'number', v_inv.number, 'currency', v_inv.currency,
      'issued_at', v_inv.issued_at, 'created_at', v_inv.created_at, 'notes', v_inv.notes,
      'bill_to_name', v_inv.bill_to_name, 'appointment_id', v_inv.appointment_id,
      'tax_rate_bp', v_inv.tax_rate_bp, 'tax_number', v_inv.tax_number,
      'subtotal_minor', v_inv.subtotal_minor, 'discount_minor', v_inv.discount_minor,
      'net_minor', v_inv.net_minor, 'tax_minor', v_inv.tax_minor, 'total_minor', v_inv.total_minor)
      || public.invoice_money(v_inv.id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', it.id, 'service_id', it.service_id, 'package_id', it.package_id, 'product_id', it.product_id,
        'description', it.description,
        'quantity', it.quantity, 'unit_price_minor', it.unit_price_minor,
        'discount_minor', it.discount_minor, 'discount_reason', it.discount_reason,
        'line_net_minor', it.line_net_minor) order by it.sort_order)
      from public.invoice_items it where it.invoice_id = v_inv.id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'method', p.method, 'amount_minor', p.amount_minor,
        'paid_at', p.paid_at, 'reverses_payment_id', p.reverses_payment_id,
        'reason', p.reason, 'note', p.note) order by p.paid_at, p.created_at)
      from public.invoice_payments p where p.invoice_id = v_inv.id), '[]'::jsonb),
    'credit_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cn.id, 'number', cn.number, 'issued_at', cn.issued_at, 'reason', cn.reason,
        'net_minor', cn.net_minor, 'tax_minor', cn.tax_minor, 'total_minor', cn.total_minor,
        'tax_rate_bp', cn.tax_rate_bp) order by cn.number_seq)
      from public.credit_notes cn where cn.invoice_id = v_inv.id), '[]'::jsonb),
    'branch', jsonb_build_object('name', v_branch.name, 'address', v_branch.address,
      'phone', v_branch.phone, 'country_code', v_branch.country_code,
      'timezone', v_branch.timezone, 'currency', v_branch.currency),
    'business', jsonb_build_object('name', v_business.name),
    'client', v_client);
end;
$fn$;
