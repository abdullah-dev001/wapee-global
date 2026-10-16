import { InvoiceRpcError, type InvoiceErrorCode } from './types';

/**
 * Maps any error from an invoices / payments / credit notes / reports read or
 * write to an i18n key, so no invoice screen shows raw server text (CLAUDE.md:
 * zero hard-coded user strings). `{ok:false, code}` arrives as `InvoiceRpcError`
 * (already narrowed to a known code or 'unknown'); a Postgrest/Postgres error
 * keeps its SQLSTATE `code` because the api layer rethrows the original error.
 */
export type InvoiceErrorKey = `invoices.errors.${InvoiceErrorCode | 'unknown'}`;

function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function invoiceErrorKey(error: unknown): InvoiceErrorKey {
  if (error instanceof InvoiceRpcError) return `invoices.errors.${error.code}`;
  // insufficient_privilege: RLS / EXECUTE refused.
  if (sqlStateOf(error) === '42501') return 'invoices.errors.forbidden';
  return 'invoices.errors.unknown';
}
