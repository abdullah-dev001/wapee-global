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
 * currently reads empty. A membership-changing mutation (accepting an invite,
 * creating a business) invalidates that list; the cached value is stale "zero
 * businesses" while the refetch it triggered is still in flight, and deciding
 * on it would redirect someone who just joined to onboarding before the
 * refetch lands. Only matters away from onboarding/accept-invite, which both
 * handle zero businesses on purpose — so this never adds a wait for a routine
 * focus/reconnect refetch of a user legitimately sitting on either of those.
 */
export function shouldWaitForRejoin(
  hasBusiness: boolean,
  isFetchingBusinesses: boolean,
  onOnboardingScreen: boolean,
  onAcceptInviteScreen: boolean,
): boolean {
  return !hasBusiness && isFetchingBusinesses && !onOnboardingScreen && !onAcceptInviteScreen;
}
