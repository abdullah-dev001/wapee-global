/**
 * Pure logic for the super admin area: who may see it, the password-session rule,
 * and the mapping of every admin reason code to a message key.
 *
 * Nothing here authorises anything. Every admin RPC checks the platform flag and a
 * fresh password session itself (`admin_session_ok`, migration 20261026130000); this
 * only decides what the UI shows.
 */

// ---------------------------------------------------------------------------
// Password session (replaced TOTP / aal2 in 20261026130000)
// ---------------------------------------------------------------------------

/** A super admin must have signed in WITH A PASSWORD within this long. Same as the DB. */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * When the session behind this access token signed in with a password (epoch ms), from
 * the JWT `amr` claim (`[{method:'password', timestamp}]`; a token refresh keeps it), or
 * null for a Google / OAuth, recovery-link or magic-link session, or an unreadable token.
 */
export function passwordSignInAt(token: string | null | undefined): number | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload !== 'object' || payload === null) return null;
    const amr = (payload as { amr?: unknown }).amr;
    if (!Array.isArray(amr)) return null;
    let latest: number | null = null;
    for (const entry of amr) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
      if (method !== 'password' || typeof timestamp !== 'number' || !Number.isFinite(timestamp))
        continue;
      const ms = timestamp * 1000;
      if (latest === null || ms > latest) latest = ms;
    }
    return latest;
  } catch {
    // Malformed token: no password session.
    return null;
  }
}

/** The admin session is usable: a password sign-in no older than 12 hours. */
export function isAdminSessionFresh(signedInAt: number | null, now: number): boolean {
  return signedInAt !== null && now - signedInAt < ADMIN_SESSION_MAX_AGE_MS;
}

// ---------------------------------------------------------------------------
// Access decisions
// ---------------------------------------------------------------------------

export const ADMIN_HOME = '/admin';
export const ADMIN_REAUTH = '/admin/sign-in-again';

export type AdminAccess =
  /** Profile or session still loading: show a skeleton, decide nothing. */
  | 'loading'
  /** Not a super admin: the admin area does not exist for this user. */
  | 'hidden'
  /** Flagged, but not a password session from the last 12 hours: sign in again. */
  | 'needs_reauth'
  /** Flagged and a fresh password session: the admin area opens. */
  | 'granted';

/** The admin entry (menu item, screens) is visible only for flag AND a fresh password session. */
export function adminAccess(input: {
  profilePending: boolean;
  isSuperAdmin: boolean;
  sessionFresh: boolean;
}): AdminAccess {
  if (input.profilePending) return 'loading';
  if (!input.isSuperAdmin) return 'hidden';
  return input.sessionFresh ? 'granted' : 'needs_reauth';
}

/**
 * Where a signed-in, verified user must be sent right now (or null = stay).
 * A flagged account without a fresh password session is sent to "sign in again",
 * and a business-less admin skips onboarding.
 *
 * A password-recovery session is the one exception: `AuthGate` is already
 * sending it to `/reset-password` (not an admin route). Once the new password is
 * saved the session is still a recovery session, so it lands on "sign in again".
 */
export function adminRedirect(input: {
  access: AdminAccess;
  pathname: string;
  hasBusiness: boolean;
  isPasswordRecovery: boolean;
}): string | null {
  const { access, pathname, hasBusiness, isPasswordRecovery } = input;
  if (isPasswordRecovery) return null;
  const onAdmin = pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
  if (access === 'needs_reauth') return pathname === ADMIN_REAUTH ? null : ADMIN_REAUTH;
  if (access === 'granted' && !hasBusiness && !onAdmin) return ADMIN_HOME;
  // A granted admin does not need the sign-in-again screen.
  if (access === 'granted' && pathname === ADMIN_REAUTH) return ADMIN_HOME;
  return null;
}

// ---------------------------------------------------------------------------
// Reason codes -> message keys (every code the 14 admin RPCs can return)
// ---------------------------------------------------------------------------

export const ADMIN_ERROR_KEYS = {
  forbidden: 'admin.errors.forbidden',
  reauth_required: 'admin.errors.reauth_required',
  invalid_input: 'admin.errors.invalid_input',
  invalid: 'admin.errors.invalid_input',
  not_found: 'admin.errors.not_found',
  plan_required: 'admin.errors.plan_required',
  over_limit: 'admin.errors.over_limit',
  invalid_plan: 'admin.errors.invalid_plan',
  invalid_period: 'admin.errors.invalid_period',
  invalid_notes: 'admin.errors.invalid_notes',
  invalid_status: 'admin.errors.invalid_status',
  invalid_days: 'admin.errors.invalid_days',
  not_extendable: 'admin.errors.not_extendable',
  unknown_addon: 'admin.errors.unknown_addon',
  invalid_amount: 'admin.errors.invalid_amount',
  insufficient: 'admin.errors.insufficient',
  search_too_short: 'admin.errors.search_too_short',
  invalid_cursor: 'admin.errors.invalid_cursor',
  invalid_terminology: 'admin.errors.invalid_terminology',
  invalid_fields: 'admin.errors.invalid_fields',
  reason_required: 'admin.errors.reason_required',
  already_removed: 'admin.errors.already_removed',
  unknown: 'admin.errors.unknown',
} as const;

export type AdminErrorCode = keyof typeof ADMIN_ERROR_KEYS;
export type AdminErrorKey = (typeof ADMIN_ERROR_KEYS)[AdminErrorCode];

export function adminErrorKey(code: string | null | undefined): AdminErrorKey {
  if (code && Object.prototype.hasOwnProperty.call(ADMIN_ERROR_KEYS, code))
    return ADMIN_ERROR_KEYS[code as AdminErrorCode];
  return ADMIN_ERROR_KEYS.unknown;
}

/** One location over the target plan's staff cap (from `over_limit`). */
export type StaffOverCap = { branch: string; activeStaff: number; cap: number };
export type BranchesOver = { current: number; max: number };
export type OverLimit = { staffOverCap: StaffOverCap[]; branchesOver: BranchesOver | null };

export function parseOverLimit(result: Record<string, unknown>): OverLimit {
  const staff = Array.isArray(result.staff_over_cap) ? result.staff_over_cap : [];
  const b = result.branches_over;
  return {
    staffOverCap: staff.flatMap((row) => {
      if (typeof row !== 'object' || row === null) return [];
      const r = row as Record<string, unknown>;
      return typeof r.branch === 'string' &&
        typeof r.active_staff === 'number' &&
        typeof r.cap === 'number'
        ? [{ branch: r.branch, activeStaff: r.active_staff, cap: r.cap }]
        : [];
    }),
    branchesOver:
      typeof b === 'object' &&
      b !== null &&
      typeof (b as Record<string, unknown>).current === 'number' &&
      typeof (b as Record<string, unknown>).max === 'number'
        ? {
            current: (b as { current: number }).current,
            max: (b as { max: number }).max,
          }
        : null,
  };
}

/** Error raised by `callAdminRpc` for `{ok:false}` results. */
export class AdminRpcError extends Error {
  readonly code: string;
  readonly overLimit: OverLimit | null;
  constructor(code: string, overLimit: OverLimit | null = null) {
    super(code);
    this.name = 'AdminRpcError';
    this.code = code;
    this.overLimit = overLimit;
  }
}

/**
 * Reads a jsonb RPC result. `{ok:true,…}` is returned; `{ok:false,code}` throws an
 * `AdminRpcError`; anything else is `unknown`. A 42501 / 42883 (anon without
 * EXECUTE, function not exposed) is `forbidden`.
 */
export function unwrapAdminResult<T extends Record<string, unknown>>(
  data: unknown,
  error: { code?: string; message?: string } | null,
): T {
  if (error) {
    if (error.code === '42501' || error.code === '42883') throw new AdminRpcError('forbidden');
    throw new AdminRpcError('unknown');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AdminRpcError('unknown');
  }
  const r = data as Record<string, unknown>;
  if (r.ok === true) return r as T;
  const code = typeof r.code === 'string' ? r.code : 'unknown';
  throw new AdminRpcError(code, code === 'over_limit' ? parseOverLimit(r) : null);
}
