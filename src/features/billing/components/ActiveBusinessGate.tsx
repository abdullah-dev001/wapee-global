import { usePathname } from 'expo-router';
import { type ReactNode } from 'react';

import { useGrantSet } from '@/lib/permissions';

import { isRouteAllowedWhenInactive } from '../inactiveRoutes';
import { TrialEndedScreen } from './TrialEndedScreen';

/**
 * Locks the app when the business is inactive — the trial ended, or a super admin
 * suspended it (product doc §10, decision 12).
 *
 * Settings and billing stay reachable, because an owner who cannot open their own
 * billing can never get the business running again. That matches the `businesses`
 * RLS policies, which are deliberately not gated on `business_is_active()`.
 *
 * A **super admin is unaffected**: they must be able to work inside an inactive
 * business to assign a plan.
 *
 * This is convenience, not security. Every operational policy goes through SQL
 * `can()`, so the data is already locked whether or not this screen renders.
 */

export function ActiveBusinessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { set, isPending } = useGrantSet();

  // Still loading: render through. The screens behind this do their own loading,
  // and flashing a lock screen at every cold start would be worse than waiting.
  if (isPending) return <>{children}</>;

  // A super admin works inside inactive businesses by design.
  if (set.isSuperAdmin) return <>{children}</>;

  // No business selected yet (onboarding, or an invite just accepted).
  if (!set.businessId) return <>{children}</>;

  if (set.isActive) return <>{children}</>;

  if (isRouteAllowedWhenInactive(pathname)) return <>{children}</>;

  return <TrialEndedScreen />;
}
