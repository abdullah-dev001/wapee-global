/**
 * Pure logic for the super admin area (Phase 8B): who may see it, the 2FA code
 * helpers, and the mapping of every admin reason code to a message key.
 *
 * Nothing here authorises anything. Every admin RPC checks the platform flag and an
 * aal2 session itself; this only decides what the UI shows.
 */

// ---------------------------------------------------------------------------
// Assurance level (2FA)
// ---------------------------------------------------------------------------

export type AssuranceLevel = 'aal1' | 'aal2';

/** The `aal` claim of an access token (JWT), or `aal1` when it cannot be read. */
export function aalFromAccessToken(token: string | null | undefined): AssuranceLevel {
  if (!token) return 'aal1';
  const part = token.split('.')[1];
  if (!part) return 'aal1';
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload === 'object' && payload !== null && 'aal' in payload) {
      return (payload as { aal?: unknown }).aal === 'aal2' ? 'aal2' : 'aal1';
    }
  } catch {
    // Malformed token: treat as the weaker level.
  }
  return 'aal1';
}

/** Digits only, at most 6 (authenticator apps show "123 456"). */
export function normaliseTotpCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}

export function isTotpCodeComplete(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Supabase returns the QR as `data:image/svg+xml;utf-8,<svg…>` (sometimes
 * percent-encoded). Returns the bare SVG markup, or null when it is not one.
 */
export function qrSvgFromDataUri(uri: string): string | null {
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:image/svg+xml') || comma < 0) return null;
  const body = uri.slice(comma + 1);
  let svg = body;
  if (!body.trimStart().startsWith('<')) {
    try {
      svg = decodeURIComponent(body);
    } catch {
      return null;
    }
  }
  return svg.trimStart().startsWith('<svg') ? svg : null;
}

/** Groups a TOTP secret in fours for reading aloud / typing. */
export function formatTotpSecret(secret: string): string {
  return secret
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

// ---------------------------------------------------------------------------
// Access decisions
// ---------------------------------------------------------------------------

export const ADMIN_HOME = '/admin';
export const ADMIN_2FA = '/admin/2fa';

export type AdminAccess =
  /** Profile or session still loading: show a skeleton, decide nothing. */
  | 'loading'
  /** Not a super admin: the admin area does not exist for this user. */
  | 'hidden'
  /** Flagged but the session is aal1: must pass the 2FA screen first. */
  | 'needs_2fa'
  /** Flagged and aal2: the admin area opens. */
  | 'granted';

/** The admin entry (menu item, screens) is visible only for flag AND aal2. */
export function adminAccess(input: {
  profilePending: boolean;
  isSuperAdmin: boolean;
  aal: AssuranceLevel;
}): AdminAccess {
  if (input.profilePending) return 'loading';
  if (!input.isSuperAdmin) return 'hidden';
  return input.aal === 'aal2' ? 'granted' : 'needs_2fa';
}

/**
 * Where a signed-in, verified user must be sent right now (or null = stay).
 * Flagged accounts are forced through 2FA at sign-in (decided with the user), and
 * a business-less admin skips onboarding.
 */
export function adminRedirect(input: {
  access: AdminAccess;
  pathname: string;
  hasBusiness: boolean;
}): string | null {
  const { access, pathname, hasBusiness } = input;
  const onAdmin = pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
  if (access === 'needs_2fa') return pathname === ADMIN_2FA ? null : ADMIN_2FA;
  if (access === 'granted' && !hasBusiness && !onAdmin) return ADMIN_HOME;
  // A granted admin does not need the 2FA screen again.
  if (access === 'granted' && pathname === ADMIN_2FA) return ADMIN_HOME;
  return null;
}

// ---------------------------------------------------------------------------
// Reason codes -> message keys (every code the 14 admin RPCs can return)
// ---------------------------------------------------------------------------

export const ADMIN_ERROR_KEYS = {
  forbidden: 'admin.errors.forbidden',
  mfa_required: 'admin.errors.mfa_required',
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
