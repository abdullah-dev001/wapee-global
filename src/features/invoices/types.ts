import { type Database } from '@/lib/supabase/database.types';

export type InvoiceStatus = Database['public']['Enums']['invoice_status'];
export type PaymentMethod = Database['public']['Enums']['invoice_payment_method'];
export type PaymentKind = Database['public']['Enums']['invoice_payment_kind'];

/** Computed server-side (`invoice_money`), never stored. `null` for a draft. */
export type PaymentStatus = 'credited' | 'pending' | 'partial' | 'paid';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer'];

/** One row of `list_invoices`. */
export type InvoiceListRow = {
  id: string;
  branchId: string;
  status: InvoiceStatus;
  number: string | null;
  currency: string;
  totalMinor: number;
  taxMinor: number;
  clientId: string | null;
  clientName: string | null;
  appointmentId: string | null;
  issuedAt: string | null;
  createdAt: string;
  paidMinor: number;
  creditedMinor: number;
  balanceMinor: number;
  refundDueMinor: number;
  paymentStatus: PaymentStatus | null;
};

export type InvoiceItem = {
  id: string;
  serviceId: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  discountReason: string | null;
  lineNetMinor: number;
};

export type InvoicePayment = {
  id: string;
  kind: PaymentKind;
  method: PaymentMethod;
  amountMinor: number;
  paidAt: string;
  reversesPaymentId: string | null;
  reason: string | null;
  note: string | null;
};

export type InvoiceCreditNote = {
  id: string;
  number: string;
  issuedAt: string;
  reason: string;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxRateBp: number;
};

/** `get_invoice_print_data`: everything the detail and print screens need. */
export type InvoiceDetail = {
  id: string;
  status: InvoiceStatus;
  number: string | null;
  currency: string;
  issuedAt: string | null;
  createdAt: string;
  notes: string | null;
  billToName: string | null;
  appointmentId: string | null;
  taxRateBp: number;
  taxNumber: string | null;
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  creditedMinor: number;
  netDueMinor: number;
  balanceMinor: number;
  refundDueMinor: number;
  paymentStatus: PaymentStatus | null;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  creditNotes: InvoiceCreditNote[];
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    countryCode: string;
    timezone: string;
    currency: string;
  };
  businessName: string;
  client: { id: string; name: string; phone: string | null; email: string | null } | null;
};

/** Every `{ok:false,code}` the invoice RPCs return (context/invoices.md). */
export const INVOICE_ERROR_CODES = [
  'forbidden',
  'not_found',
  'invalid_branch',
  'branch_mismatch',
  'not_completed',
  'already_invoiced',
  'client_mismatch',
  'unknown_client',
  'invalid_items',
  'too_many_items',
  'unknown_service',
  'invalid_description',
  'invalid_quantity',
  'invalid_price',
  'invalid_discount',
  'discount_forbidden',
  'discount_reason_required',
  'discount_too_large',
  'not_draft',
  'not_issued',
  'no_items',
  'zero_total',
  'currency_changed',
  'invalid_method',
  'invalid_amount',
  'invalid_paid_at',
  'fully_credited',
  'overpayment',
  'not_a_payment',
  'reason_required',
  'invalid_filter',
] as const;

export type InvoiceErrorCode = (typeof INVOICE_ERROR_CODES)[number];

export class InvoiceRpcError extends Error {
  code: InvoiceErrorCode | 'unknown';

  constructor(code: string) {
    super(code);
    this.code = (INVOICE_ERROR_CODES as readonly string[]).includes(code)
      ? (code as InvoiceErrorCode)
      : 'unknown';
    this.name = 'InvoiceRpcError';
  }
}
