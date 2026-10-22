/**
 * "Continue with Google" (Supabase OAuth): the pure decisions, with no react-native import, so
 * they are unit-testable directly (same reasoning as `authErrorKey.ts`).
 *
 * - Where the button exists: web and the installed PWA only (not the native apps), and NOT an
 *   installed iOS PWA: iOS opens the Google page in a separate Safari sheet whose storage is not
 *   the PWA's, so the session would land in the wrong place (user decision Q7, 2026-10-23).
 * - What the `/auth/callback` page reads when Google or Supabase sends the user back with an
 *   error instead of a session (`error`, `error_code`, `error_description`, in the query for some
 *   flows and in the fragment for the implicit flow this app uses).
 */

export const OAUTH_CALLBACK_PATH = '/auth/callback';

export type GoogleAvailabilityInput = {
  os: string;
  /** iPhone / iPad / iPod (including iPadOS reporting itself as a Mac with touch). */
  isIOS: boolean;
  /** Running as an installed app (`navigator.standalone` or display-mode standalone). */
  isStandalone: boolean;
};

export function isGoogleSignInAvailable(input: GoogleAvailabilityInput): boolean {
  if (input.os !== 'web') return false;
  return !(input.isIOS && input.isStandalone);
}

/** Reads the browser's own facts for `isGoogleSignInAvailable`. Web only; safe elsewhere. */
export function browserAvailabilityInput(os: string): GoogleAvailabilityInput {
  if (os !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { os, isIOS: false, isStandalone: false };
  }
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const nav = navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches);
  return { os, isIOS, isStandalone };
}

export type OAuthCallbackError = {
  error: string;
  code: string | null;
  description: string | null;
};

/** The error the provider / Supabase put on the callback URL, or null when there is none. */
export function readOAuthCallbackError(href: string): OAuthCallbackError | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const fromHash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  for (const params of [fromHash, url.searchParams]) {
    const error = params.get('error');
    if (error) {
      return {
        error,
        code: params.get('error_code'),
        description: params.get('error_description'),
      };
    }
  }
  return null;
}

export const OAUTH_ERROR_KEYS = {
  cancelled: 'auth.google.cancelled',
  disabled: 'auth.accountDisabled',
  adminPasswordOnly: 'auth.google.adminPasswordOnly',
  failed: 'auth.google.failed',
} as const;

export type OAuthErrorKey = (typeof OAUTH_ERROR_KEYS)[keyof typeof OAUTH_ERROR_KEYS];

/**
 * Maps a callback error to a message key. The disabled-account case comes from our own Custom
 * Access Token hook (its message, as on the password sign-in path), and so does the super admin
 * refusal (20261026130000: super admins sign in with a password only); `access_denied` is the user
 * closing or refusing the Google screen. Everything else is one generic message: provider text
 * is never shown.
 */
export function oauthErrorKey(err: OAuthCallbackError): OAuthErrorKey {
  if (err.description && /account is disabled/i.test(err.description)) {
    return OAUTH_ERROR_KEYS.disabled;
  }
  if (
    err.description &&
    /super admin accounts sign in with email and password/i.test(err.description)
  ) {
    return OAUTH_ERROR_KEYS.adminPasswordOnly;
  }
  if (err.error === 'access_denied' && !err.description?.match(/hook/i)) {
    return OAUTH_ERROR_KEYS.cancelled;
  }
  return OAUTH_ERROR_KEYS.failed;
}
