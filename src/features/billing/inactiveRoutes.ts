/**
 * Which routes stay open while the business is inactive (trial ended, or
 * suspended by a super admin — product doc §10, decision 12).
 *
 * Settings and billing must stay reachable, because an owner who cannot open
 * their own billing can never get the business running again. That matches the
 * `businesses` RLS policies, which are deliberately not gated on
 * `business_is_active()`.
 *
 * `/more` is here because on mobile it is the only route to Settings; locking it
 * would strand the owner. The destinations listed inside More are still gated by
 * their own screens.
 *
 * Kept separate from the component so it can be unit tested.
 */
export const ROUTES_ALLOWED_WHEN_INACTIVE = ['/settings', '/billing', '/more'] as const;

/** Is this route still open while the business is inactive? */
export function isRouteAllowedWhenInactive(pathname: string): boolean {
  return ROUTES_ALLOWED_WHEN_INACTIVE.some((route) => pathname.startsWith(route));
}
