/**
 * Client-side mirror of SQL `business_is_active()`: active (and, if a paid
 * period end is set, still within it), or trialing with the trial still
 * running. Evaluated at render time, so a trial or a paid period ending while
 * the app is open locks it on the next render, exactly as the database does
 * per query. `currentPeriodEnd` is null for manual billing with no expiry —
 * that never locks anything.
 *
 * Split out from `useGrants.ts` (no React Native imports) so it can be unit
 * tested directly, same reason `trialCountdown.ts` is its own file.
 */
export function isBusinessActive(
  status: string | null,
  trialEndsAt: string | null,
  currentPeriodEnd: string | null = null,
  now: Date = new Date(),
): boolean {
  if (status === 'active') return !currentPeriodEnd || new Date(currentPeriodEnd) > now;
  if (status === 'trialing' && trialEndsAt) return new Date(trialEndsAt) > now;
  return false;
}
