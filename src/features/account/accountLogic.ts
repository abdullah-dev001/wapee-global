/** Pure helpers for the account screens (tested). */

/** Reason codes the account flows can end with, mapped to i18n keys. Unknown codes fall back. */
export const ACCOUNT_ERROR_KEYS = {
  wrong_password: 'account.errors.wrong_password',
  confirm_mismatch: 'account.errors.confirm_mismatch',
  sole_owner: 'account.errors.sole_owner',
  super_admin: 'account.errors.super_admin',
  same_password: 'account.errors.same_password',
  weak_password: 'account.errors.weak_password',
  email_exists: 'account.errors.email_exists',
  same_email: 'account.errors.same_email',
  rate_limited: 'account.errors.rate_limited',
  forbidden: 'account.errors.forbidden',
  unknown: 'account.errors.unknown',
} as const;

export type AccountErrorKey = (typeof ACCOUNT_ERROR_KEYS)[keyof typeof ACCOUNT_ERROR_KEYS];

export function accountErrorKey(code: string | null | undefined): AccountErrorKey {
  if (code && Object.prototype.hasOwnProperty.call(ACCOUNT_ERROR_KEYS, code)) {
    return ACCOUNT_ERROR_KEYS[code as keyof typeof ACCOUNT_ERROR_KEYS];
  }
  return ACCOUNT_ERROR_KEYS.unknown;
}

/** Maps a Supabase auth error code (or HTTP status) to one of our codes. */
export function authErrorCode(error: { code?: string; status?: number }): string {
  switch (error.code) {
    case 'same_password':
      return 'same_password';
    case 'weak_password':
      return 'weak_password';
    case 'email_exists':
    case 'user_already_exists':
      return 'email_exists';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'rate_limited';
    default:
      return error.status === 429 ? 'rate_limited' : 'unknown';
  }
}

/** Typed confirmation of the account email: trimmed, case-insensitive. */
export function emailsMatch(typed: string, expected: string): boolean {
  const want = expected.trim().toLowerCase();
  return want.length > 0 && typed.trim().toLowerCase() === want;
}
