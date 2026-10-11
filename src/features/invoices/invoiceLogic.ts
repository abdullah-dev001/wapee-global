import {
  type InvoiceCreditNote,
  type InvoiceDetail,
  type InvoicePayment,
  type InvoiceStatus,
  type PaymentStatus,
} from './types';

/**
 * Pure invoice logic for the UI. **None of this is the boundary**: the RPCs
 * re-check everything. Wrong output here can only show or hide a button or a
 * preview number wrongly; it can never change what is stored.
 */

export type DraftLine = {
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
};

export type DraftTotals = {
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
};

/**
 * Preview of the totals the server will store, for the draft editor only.
 * Mirrors `invoice_totals()`: tax once on the net after discounts, half-up
 * (`floor((net * bp + 5000) / 10000)`), tax-EXCLUSIVE pricing.
 */
export function computeDraftTotals(lines: readonly DraftLine[], taxRateBp: number): DraftTotals {
  let subtotal = 0;
  let discount = 0;
  for (const line of lines) {
    subtotal += line.quantity * line.unitPriceMinor;
    discount += line.discountMinor;
  }
  const net = subtotal - discount;
  const tax = Math.floor((net * taxRateBp + 5000) / 10000);
  return {
    subtotalMinor: subtotal,
    discountMinor: discount,
    netMinor: net,
    taxMinor: tax,
    totalMinor: net + tax,
  };
}

/** A draft line's gross minus its discount. */
export function lineNetMinor(line: DraftLine): number {
  return line.quantity * line.unitPriceMinor - line.discountMinor;
}

export type InvoiceAction = 'edit' | 'discard' | 'issue' | 'addPayment' | 'creditNote' | 'print';

export type InvoicePermissions = {
  canView: boolean;
  canCreate: boolean;
  canCreditNote: boolean;
};

/**
 * Which actions an invoice offers: STATUS first (a draft is editable, an issued
 * invoice is immutable), then the caller's permissions, then the money state.
 * Mirrors the RPC rules (`invoices.create` for draft/issue/payment,
 * `invoices.credit_note` for credit notes and reversals).
 */
export function actionsForInvoice(
  invoice: Pick<InvoiceDetail, 'status' | 'paymentStatus' | 'balanceMinor' | 'netMinor'> & {
    creditedNetMinor?: number;
  },
  permissions: InvoicePermissions,
): InvoiceAction[] {
  const actions: InvoiceAction[] = [];
  if (invoice.status === 'draft') {
    if (permissions.canCreate) actions.push('edit', 'issue', 'discard');
    if (permissions.canView) actions.push('print');
    return actions;
  }
  if (permissions.canCreate && invoice.paymentStatus !== 'credited' && invoice.balanceMinor > 0) {
    actions.push('addPayment');
  }
  if (permissions.canCreditNote && invoice.paymentStatus !== 'credited') {
    actions.push('creditNote');
  }
  if (permissions.canView) actions.push('print');
  return actions;
}

/** What is still reversible on one payment row: its amount minus what earlier reversals took. */
export function reversibleMinor(
  payment: Pick<InvoicePayment, 'id' | 'kind' | 'amountMinor'>,
  payments: readonly Pick<InvoicePayment, 'kind' | 'amountMinor' | 'reversesPaymentId'>[],
): number {
  if (payment.kind !== 'payment') return 0;
  const reversed = payments
    .filter((p) => p.kind === 'reversal' && p.reversesPaymentId === payment.id)
    .reduce((sum, p) => sum + p.amountMinor, 0);
  return Math.max(payment.amountMinor - reversed, 0);
}

export function canReversePayment(
  payment: Pick<InvoicePayment, 'id' | 'kind' | 'amountMinor'>,
  payments: readonly Pick<InvoicePayment, 'kind' | 'amountMinor' | 'reversesPaymentId'>[],
  permissions: InvoicePermissions,
): boolean {
  return permissions.canCreditNote && reversibleMinor(payment, payments) > 0;
}

/** Net still creditable on an invoice: invoice net minus the net of earlier credit notes. */
export function creditableNetMinor(
  invoiceNetMinor: number,
  creditNotes: readonly Pick<InvoiceCreditNote, 'netMinor'>[],
): number {
  return Math.max(invoiceNetMinor - creditNotes.reduce((sum, c) => sum + c.netMinor, 0), 0);
}

export type BadgeToneName = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary';

/** Badge tone for the invoice's lifecycle/payment state (one place). */
export function invoiceStateTone(
  status: InvoiceStatus,
  paymentStatus: PaymentStatus | null,
): BadgeToneName {
  if (status === 'draft') return 'neutral';
  switch (paymentStatus) {
    case 'paid':
      return 'success';
    case 'partial':
      return 'warning';
    case 'credited':
      return 'info';
    default:
      return 'primary';
  }
}

/** i18n key suffix for the one state to show: draft, or the payment status. */
export function invoiceStateKey(
  status: InvoiceStatus,
  paymentStatus: PaymentStatus | null,
): 'draft' | PaymentStatus {
  if (status === 'draft') return 'draft';
  return paymentStatus ?? 'pending';
}

export type CurrencyRow = { currency: string };

/**
 * Report rows are already per currency from the server; this only gives them a
 * stable order and never merges two currencies into one number.
 */
export function sortByCurrency<T extends CurrencyRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.currency.localeCompare(b.currency));
}

export const APPOINTMENT_STATUS_ORDER = [
  'completed',
  'confirmed',
  'pending',
  'cancelled',
  'no_show',
] as const;

/** Status counts in a fixed order, zeros kept so the card layout never jumps. */
export function statusCountRows(
  counts: Record<string, number> | null | undefined,
): { status: (typeof APPOINTMENT_STATUS_ORDER)[number]; count: number }[] {
  return APPOINTMENT_STATUS_ORDER.map((status) => ({ status, count: counts?.[status] ?? 0 }));
}

/** Bar width as a whole percent of the largest value (min 4% so a non-zero bar is visible). */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(4, Math.round((value / max) * 100));
}
