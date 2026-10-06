import { z } from 'zod';

import { PAYMENT_METHODS } from '../types';

/** Error messages are i18n KEYS (translated by `FormField`/the forms), never display text. */
const MAX_PRICE = 100_000_000_000;

export const invoiceLineSchema = z
  .object({
    serviceId: z.string().nullable(),
    packageId: z.string().nullable(),
    productId: z.string().nullable(),
    description: z
      .string()
      .trim()
      .min(1, 'invoices.errors.invalid_description')
      .max(200, 'invoices.errors.invalid_description'),
    quantity: z
      .number('invoices.errors.invalid_quantity')
      .int('invoices.errors.invalid_quantity')
      .min(1, 'invoices.errors.invalid_quantity')
      .max(9999, 'invoices.errors.invalid_quantity'),
    unitPriceMinor: z
      .number('invoices.errors.invalid_price')
      .int('invoices.errors.invalid_price')
      .min(0, 'invoices.errors.invalid_price')
      .max(MAX_PRICE, 'invoices.errors.invalid_price'),
    discountMinor: z.number().int().min(0, 'invoices.errors.invalid_discount'),
    discountReason: z.string().trim().max(200),
  })
  .superRefine((line, ctx) => {
    if (line.discountMinor > 0 && line.discountReason.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountReason'],
        message: 'invoices.errors.discount_reason_required',
      });
    }
    if (line.discountMinor > line.quantity * line.unitPriceMinor) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountMinor'],
        message: 'invoices.errors.discount_too_large',
      });
    }
  });

export const invoiceEditorSchema = z.object({
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  notes: z.string().trim().max(1000),
  lines: z.array(invoiceLineSchema).max(100, 'invoices.errors.too_many_items'),
});

export type InvoiceEditorValues = z.infer<typeof invoiceEditorSchema>;
export type InvoiceLineValues = z.infer<typeof invoiceLineSchema>;

export const emptyInvoiceEditor: InvoiceEditorValues = {
  clientId: null,
  clientName: null,
  notes: '',
  lines: [],
};

export const emptyLine: InvoiceLineValues = {
  serviceId: null,
  packageId: null,
  productId: null,
  description: '',
  quantity: 1,
  unitPriceMinor: 0,
  discountMinor: 0,
  discountReason: '',
};

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS as [string, ...string[]], 'invoices.errors.invalid_method'),
  amountMinor: z
    .number('invoices.errors.invalid_amount')
    .int('invoices.errors.invalid_amount')
    .min(1, 'invoices.errors.invalid_amount'),
  /** "YYYY-MM-DD" in the branch timezone. */
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invoices.errors.invalid_paid_at'),
  note: z.string().trim().max(200),
});

export type PaymentValues = z.infer<typeof paymentSchema>;

/** Reverse a payment / create a credit note: an amount (optional = everything left) and a reason. */
export const reasonAmountSchema = z.object({
  amountMinor: z
    .number('invoices.errors.invalid_amount')
    .int('invoices.errors.invalid_amount')
    .min(1, 'invoices.errors.invalid_amount'),
  reason: z.string().trim().min(3, 'invoices.errors.reason_required').max(200),
});

export type ReasonAmountValues = z.infer<typeof reasonAmountSchema>;
