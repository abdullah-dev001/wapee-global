/** Pure helpers for the client portal (tested). */

/** A forgiving, trimmed, lower-case email for the sign-in form; null when it cannot be an address. */
export function cleanEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export type PortalTab = 'bookings' | 'packages' | 'invoices' | 'photos' | 'forms' | 'data';

/** Tabs to show: the add-on tabs only when the business has them; "My data" is always last (a legal right, not a feature). */
export function visibleTabs(
  features: { packages: boolean; files: boolean; forms: boolean } | null,
): PortalTab[] {
  const tabs: PortalTab[] = ['bookings', 'invoices'];
  if (features?.packages) tabs.splice(1, 0, 'packages');
  if (features?.files) tabs.push('photos');
  if (features?.forms) tabs.push('forms');
  tabs.push('data');
  return tabs;
}

export const PORTAL_ERROR_KEYS = {
  cancel_window_passed: 'portal.errors.cancel_window_passed',
  not_cancellable: 'portal.errors.not_cancellable',
  slot_unavailable: 'portal.errors.slot_unavailable',
  not_bookable: 'portal.errors.not_bookable',
  needs_details: 'portal.errors.needs_details',
  not_found: 'portal.errors.not_found',
  rate_limited: 'portal.errors.rate_limited',
  server_error: 'portal.errors.unknown',
} as const;

export function portalErrorKey(
  code: string | null | undefined,
): (typeof PORTAL_ERROR_KEYS)[keyof typeof PORTAL_ERROR_KEYS] {
  if (code && Object.prototype.hasOwnProperty.call(PORTAL_ERROR_KEYS, code)) {
    return PORTAL_ERROR_KEYS[code as keyof typeof PORTAL_ERROR_KEYS];
  }
  return PORTAL_ERROR_KEYS.server_error;
}

/** Payment status label key for an invoice row. */
export function paymentLabelKey(
  status: string | null | undefined,
):
  | 'portal.invoices.paid'
  | 'portal.invoices.partial'
  | 'portal.invoices.pending'
  | 'portal.invoices.credited' {
  if (status === 'paid') return 'portal.invoices.paid';
  if (status === 'partial') return 'portal.invoices.partial';
  if (status === 'credited') return 'portal.invoices.credited';
  return 'portal.invoices.pending';
}
