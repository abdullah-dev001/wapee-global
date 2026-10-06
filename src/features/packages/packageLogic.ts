/**
 * Pure rules for packages and sessions. The database decides everything
 * (`deduct_session`, `reverse_session`, `list_client_packages`); these helpers only
 * label what it returned and mirror the undo window so a button is not offered that
 * the server would refuse.
 */

/** A creator may undo their own deduction for this long (product doc §8.1). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export type ClientPackage = {
  id: string;
  branchId: string;
  name: string;
  sessionsPurchased: number;
  sessionsBonus: number;
  used: number;
  remaining: number;
  soldAt: string;
  expiresAt: string | null;
  isCancelled: boolean;
  isExpired: boolean;
  priceMinor: number;
  currency: string;
  invoiceId: string;
  serviceIds: string[];
};

export type PackageState = 'active' | 'used_up' | 'expired' | 'cancelled';

/** The one label a package shows: cancelled beats expired beats used up. */
export function packageState(
  pkg: Pick<ClientPackage, 'isCancelled' | 'isExpired' | 'remaining'>,
): PackageState {
  if (pkg.isCancelled) return 'cancelled';
  if (pkg.isExpired) return 'expired';
  if (pkg.remaining <= 0) return 'used_up';
  return 'active';
}

export function isUsable(
  pkg: Pick<ClientPackage, 'isCancelled' | 'isExpired' | 'remaining'>,
): boolean {
  return packageState(pkg) === 'active';
}

/** "5 of 8" style numbers: total = purchased + bonus. */
export function totalSessions(
  pkg: Pick<ClientPackage, 'sessionsPurchased' | 'sessionsBonus'>,
): number {
  return pkg.sessionsPurchased + pkg.sessionsBonus;
}

export type SessionUsage = {
  id: string;
  kind: 'deduct' | 'reversal';
  clientPackageId: string;
  packageName: string;
  appointmentId: string | null;
  reversesUsageId: string | null;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
};

/** The deductions of an appointment that have NOT been reversed (newest first). */
export function activeDeductions(rows: readonly SessionUsage[]): SessionUsage[] {
  const reversed = new Set(rows.filter((r) => r.kind === 'reversal').map((r) => r.reversesUsageId));
  return rows
    .filter((r) => r.kind === 'deduct' && !reversed.has(r.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The device clock may run behind the server's by this much without hiding a valid Undo. */
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

/**
 * May this user undo (as the creator) right now? Only decides whether to OFFER the button: the
 * server enforces the exact window against its own clock (holders of `packages.reverse_session`
 * can reverse at any time, with a reason).
 */
export function canUndoNow(
  usage: Pick<SessionUsage, 'createdAt' | 'createdBy'>,
  userId: string | null,
  nowMs: number,
): boolean {
  if (!userId || usage.createdBy !== userId) return false;
  const age = nowMs - new Date(usage.createdAt).getTime();
  return age >= -CLOCK_SKEW_MS && age <= UNDO_WINDOW_MS;
}

export const PACKAGE_ERROR_KEYS = {
  forbidden: 'packages.errors.forbidden',
  feature_unavailable: 'packages.errors.feature_unavailable',
  not_found: 'packages.errors.not_found',
  invalid_name: 'packages.errors.invalid_name',
  invalid_description: 'packages.errors.invalid_description',
  invalid_sessions: 'packages.errors.invalid_sessions',
  invalid_bonus: 'packages.errors.invalid_bonus',
  invalid_price: 'packages.errors.invalid_price',
  invalid_expiry: 'packages.errors.invalid_expiry',
  services_required: 'packages.errors.services_required',
  unknown_service: 'packages.errors.unknown_service',
  duplicate_name: 'packages.errors.duplicate_name',
  currency_changed: 'packages.errors.currency_changed',
  appointment_not_eligible: 'packages.errors.appointment_not_eligible',
  client_mismatch: 'packages.errors.client_mismatch',
  package_cancelled: 'packages.errors.package_cancelled',
  expired: 'packages.errors.expired',
  service_not_covered: 'packages.errors.service_not_covered',
  already_deducted: 'packages.errors.already_deducted',
  no_sessions_left: 'packages.errors.no_sessions_left',
  already_reversed: 'packages.errors.already_reversed',
  not_a_usage: 'packages.errors.not_a_usage',
  undo_window_passed: 'packages.errors.undo_window_passed',
  reason_required: 'packages.errors.reason_required',
  unknown: 'packages.errors.unknown',
} as const;

export type PackageErrorCode = keyof typeof PACKAGE_ERROR_KEYS;

export function packageErrorKey(
  code: string | null,
): (typeof PACKAGE_ERROR_KEYS)[PackageErrorCode] {
  if (code && Object.prototype.hasOwnProperty.call(PACKAGE_ERROR_KEYS, code)) {
    return PACKAGE_ERROR_KEYS[code as PackageErrorCode];
  }
  return PACKAGE_ERROR_KEYS.unknown;
}
