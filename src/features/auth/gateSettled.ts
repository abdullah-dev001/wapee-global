import { useState } from 'react';

/**
 * Whether a root gate may show its full-screen spinner. The spinner replaces the
 * whole app tree, so it is only for the FIRST load of a user: once the gate has
 * settled for that user, a later "pending" flip (a cache reset, a background
 * refetch) must never unmount the screens and lose form input or open popups.
 */
export function showGateSpinner(
  pending: boolean,
  settledFor: string | null,
  userId: string | null,
) {
  if (!pending) return false;
  return settledFor === null || settledFor !== userId;
}

/**
 * Remembers which user the gate has already settled for. A different user starts
 * unsettled again, so a new sign-in never sees another account's half-loaded state.
 */
export function useGateSpinner(pending: boolean, userId: string | null): boolean {
  const [settledFor, setSettledFor] = useState<string | null>(null);

  // Adjusting state during render (React's documented pattern for derived state).
  if (!pending && userId !== null && settledFor !== userId) setSettledFor(userId);

  return showGateSpinner(pending, settledFor, userId);
}

/**
 * Whether the gate should wait rather than decide, while the membership list
 * currently reads empty. A membership-changing action (a pending add being
 * claimed on focus, creating a business) invalidates that list; the cached value
 * is stale "zero businesses" while the refetch it triggered is still in flight,
 * and deciding on it would redirect someone who just joined to onboarding before
 * the refetch lands. Only matters away from onboarding, which handles zero
 * businesses on purpose — so this never adds a wait for a routine
 * focus/reconnect refetch of a user legitimately sitting there.
 */
export function shouldWaitForRejoin(
  hasBusiness: boolean,
  isFetchingBusinesses: boolean,
  onOnboardingScreen: boolean,
): boolean {
  return !hasBusiness && isFetchingBusinesses && !onOnboardingScreen;
}

/** Route groups that an unauthenticated visitor may open. */
export const PUBLIC_GROUPS = new Set(['(auth)', '(public)']);
/** Screens inside (auth) that a signed-in but unverified user still needs. */
export const VERIFY_ROUTE = 'verify';
/** Where a verified user with no business goes. */
export const ONBOARDING_ROUTE = 'onboarding';
/**
 * Opening a password-recovery email link signs the user in like any other
 * session — verified, often with a business already — so every OTHER rule
 * below would normally bounce them off this screen before they can set a new
 * password (home if they have a business, `/admin/2fa` via `AdminAccessGate`
 * if they are a 2FA-enrolled super admin). This route is the one place a
 * recovery session is always sent, and the only (auth) screen it is never
 * redirected away from.
 */
export const RESET_PASSWORD_ROUTE = 'reset-password';

export type AuthGateDecision =
  | { kind: 'wait' }
  | { kind: 'render' }
  | { kind: 'redirect'; href: '/login' | '/verify' | '/onboarding' | '/reset-password' | '/' };

/**
 * Pure routing decision for `AuthGate` (CLAUDE.md §4, §7):
 * - signed out, private route     -> /login
 * - password-recovery session     -> /reset-password (before anything else)
 * - signed in, unverified         -> /verify
 * - verified, but has no business -> /onboarding (only once the first claim of
 *   pending "add by email" memberships has finished: `waitForClaim`)
 * - fully set up, on an auth page -> /
 *
 * `'wait'` means: render the route tree as-is and overlay a spinner, never
 * unmount it — see AuthGate's own comment for why unmounting the tree for a
 * loading spinner is unsafe (it can lose the current URL).
 */
export function authGateDecision(input: {
  isSupabaseConfigured: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isPasswordRecovery: boolean;
  segments: readonly string[];
  hasBusiness: boolean;
  waitForBusinesses: boolean;
  waitForRejoin: boolean;
  /**
   * The first `claim_pending_memberships` call for this user has not finished. A
   * verified person who was added by email has zero businesses until it lands;
   * deciding before it would flash /onboarding (and could start a trial).
   */
  waitForClaim: boolean;
}): AuthGateDecision {
  const {
    isSupabaseConfigured,
    loading,
    isAuthenticated,
    isEmailVerified,
    isPasswordRecovery,
    segments,
    hasBusiness,
    waitForBusinesses,
    waitForRejoin,
    waitForClaim,
  } = input;

  if (!isSupabaseConfigured) return { kind: 'render' };
  if (loading) return { kind: 'wait' };

  const group = segments[0];
  const isPublicGroup = typeof group === 'string' && PUBLIC_GROUPS.has(group);
  const isAuthGroup = group === '(auth)';
  const onAdminRoute = group === '(admin)';
  const onVerifyScreen = segments.includes(VERIFY_ROUTE);
  const onOnboardingScreen = segments.includes(ONBOARDING_ROUTE);
  const onResetPasswordScreen = segments.includes(RESET_PASSWORD_ROUTE);

  if (!isAuthenticated && !isPublicGroup) return { kind: 'redirect', href: '/login' };
  // A recovery session outranks every other rule below (unverified, no
  // business, already has a business): wherever it is, it goes to the reset
  // screen, and once there it is never bounced off it again.
  if (isAuthenticated && isPasswordRecovery && !onResetPasswordScreen) {
    return { kind: 'redirect', href: '/reset-password' };
  }
  if (isAuthenticated && onResetPasswordScreen) return { kind: 'render' };
  if (isAuthenticated && !isEmailVerified && !onVerifyScreen) {
    return { kind: 'redirect', href: '/verify' };
  }
  if (isAuthenticated && isEmailVerified) {
    if (waitForBusinesses || waitForRejoin || waitForClaim) return { kind: 'wait' };
    if (!hasBusiness && !onOnboardingScreen && !onAdminRoute) {
      return { kind: 'redirect', href: '/onboarding' };
    }
    if (hasBusiness && isAuthGroup) return { kind: 'redirect', href: '/' };
  }
  return { kind: 'render' };
}
