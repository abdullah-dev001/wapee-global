import {
  type InvoiceCreditNote,
  type InvoiceDetail,
  type InvoiceItem,
  type InvoiceListRow,
  type InvoicePayment,
  type InvoiceStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '../types';

export type Raw = Record<string, unknown>;

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}
function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function mapListRow(row: Raw): InvoiceListRow {
  return {
    id: String(row.id),
    branchId: String(row.branch_id),
    status: row.status as InvoiceStatus,
    number: str(row.number),
    currency: String(row.currency),
    totalMinor: num(row.total_minor),
    taxMinor: num(row.tax_minor),
    clientId: str(row.client_id),
    clientName: str(row.client_name),
    appointmentId: str(row.appointment_id),
    issuedAt: str(row.issued_at),
    createdAt: String(row.created_at),
    paidMinor: num(row.paid_minor),
    creditedMinor: num(row.credited_minor),
    balanceMinor: num(row.balance_minor),
    refundDueMinor: num(row.refund_due_minor),
    paymentStatus: (row.payment_status as PaymentStatus | null) ?? null,
  };
}

function mapItem(row: Raw): InvoiceItem {
  return {
    id: String(row.id),
    serviceId: str(row.service_id),
    packageId: str(row.package_id),
    productId: str(row.product_id),
    description: String(row.description),
    quantity: num(row.quantity),
    unitPriceMinor: num(row.unit_price_minor),
    discountMinor: num(row.discount_minor),
    discountReason: str(row.discount_reason),
    lineNetMinor: num(row.line_net_minor),
  };
}

function mapPayment(row: Raw): InvoicePayment {
  return {
    id: String(row.id),
    kind: row.kind as InvoicePayment['kind'],
    method: row.method as PaymentMethod,
    amountMinor: num(row.amount_minor),
    paidAt: String(row.paid_at),
    reversesPaymentId: str(row.reverses_payment_id),
    reason: str(row.reason),
    note: str(row.note),
  };
}

function mapCreditNote(row: Raw): InvoiceCreditNote {
  return {
    id: String(row.id),
    number: String(row.number),
    issuedAt: String(row.issued_at),
    reason: String(row.reason),
    netMinor: num(row.net_minor),
    taxMinor: num(row.tax_minor),
    totalMinor: num(row.total_minor),
    taxRateBp: num(row.tax_rate_bp),
  };
}

export function mapInvoiceDetail(result: Raw): InvoiceDetail {
  const inv = result.invoice as Raw;
  const branch = result.branch as Raw;
  const business = result.business as Raw;
  const client = result.client as Raw | null;
  return {
    id: String(inv.id),
    status: inv.status as InvoiceStatus,
    number: str(inv.number),
    currency: String(inv.currency),
    issuedAt: str(inv.issued_at),
    createdAt: String(inv.created_at),
    notes: str(inv.notes),
    billToName: str(inv.bill_to_name),
    appointmentId: str(inv.appointment_id),
    taxRateBp: num(inv.tax_rate_bp),
    taxNumber: str(inv.tax_number),
    subtotalMinor: num(inv.subtotal_minor),
    discountMinor: num(inv.discount_minor),
    netMinor: num(inv.net_minor),
    taxMinor: num(inv.tax_minor),
    totalMinor: num(inv.total_minor),
    paidMinor: num(inv.paid_minor),
    creditedMinor: num(inv.credited_minor),
    netDueMinor: num(inv.net_due_minor),
    balanceMinor: num(inv.balance_minor),
    refundDueMinor: num(inv.refund_due_minor),
    paymentStatus: (inv.payment_status as PaymentStatus | null) ?? null,
    items: ((result.items as Raw[]) ?? []).map(mapItem),
    payments: ((result.payments as Raw[]) ?? []).map(mapPayment),
    creditNotes: ((result.credit_notes as Raw[]) ?? []).map(mapCreditNote),
    branch: {
      name: String(branch.name),
      address: str(branch.address),
      phone: str(branch.phone),
      countryCode: String(branch.country_code),
      timezone: String(branch.timezone),
      currency: String(branch.currency),
    },
    businessName: String(business.name),
    client: client
      ? {
          id: String(client.id),
          name: String(client.name),
          phone: str(client.phone),
          email: str(client.email),
        }
      : null,
  };
}
