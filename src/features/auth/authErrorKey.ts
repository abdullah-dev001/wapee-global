/**
 * Maps a Supabase Auth / Postgrest error to an i18n key, so no auth screen ever
 * shows raw server text (CLAUDE.md: zero hard-coded user strings). Mirrors the
 * reason-code pattern in `src/features/admin/adminLogic.ts`.
 *
 * Branches on `code`/`status` first (stable), and only falls back to a message
 * pattern for the one case neither exposes structurally: the disabled-account
 * hook error, matched elsewhere by `isAccountDisabledError`.
 */

export const AUTH_ERROR_KEYS = {
  invalidCredentials: 'auth.errors.invalidCredentials',
  emailNotConfirmed: 'auth.errors.emailNotConfirmed',
  alreadyRegistered: 'auth.errors.alreadyRegistered',
  weakPassword: 'auth.errors.weakPasswordServer',
  rateLimited: 'auth.errors.rateLimited',
  network: 'auth.errors.network',
  expiredLink: 'auth.errors.expiredLink',
  slugTaken: 'auth.errors.slugTaken',
  insufficientAal: 'auth.errors.insufficientAal',
  generic: 'auth.errors.generic',
} as const;

export type AuthErrorKey = (typeof AUTH_ERROR_KEYS)[keyof typeof AUTH_ERROR_KEYS];

/** The subset of fields read off a Supabase `AuthError` / `PostgrestError`. */
type ErrorLike = { code?: string | null; status?: number | null; message?: string | null };

function asErrorLike(error: unknown): ErrorLike | null {
  if (typeof error !== 'object' || error === null) return null;
  return error as ErrorLike;
}

/** Supabase-js throws `TypeError: Failed to fetch` (or RN's equivalent) when offline. */
function isNetworkError(error: ErrorLike): boolean {
  return (
    typeof error.message === 'string' &&
    /network request failed|failed to fetch/i.test(error.message)
  );
}

export function authErrorKey(error: unknown): AuthErrorKey {
  const e = asErrorLike(error);
  if (!e) return AUTH_ERROR_KEYS.generic;

  switch (e.code) {
    case 'invalid_credentials':
      return AUTH_ERROR_KEYS.invalidCredentials;
    case 'email_not_confirmed':
      return AUTH_ERROR_KEYS.emailNotConfirmed;
    case 'email_exists':
    case 'user_already_exists':
      return AUTH_ERROR_KEYS.alreadyRegistered;
    case 'weak_password':
      return AUTH_ERROR_KEYS.weakPassword;
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return AUTH_ERROR_KEYS.rateLimited;
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return AUTH_ERROR_KEYS.expiredLink;
    // Postgres errcodes raised by create_business_with_owner (plain RPC errors,
    // not AuthError, but the same field carries the code).
    case '23514':
      return AUTH_ERROR_KEYS.slugTaken;
    case 'insufficient_aal':
      return AUTH_ERROR_KEYS.insufficientAal;
    default:
      break;
  }

  // HTTP 429 without (or with an unrecognised) code is still a rate limit.
  if (e.status === 429) return AUTH_ERROR_KEYS.rateLimited;

  if (isNetworkError(e)) return AUTH_ERROR_KEYS.network;

  return AUTH_ERROR_KEYS.generic;
}
