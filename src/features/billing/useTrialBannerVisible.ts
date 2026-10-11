import { usePermission, useCurrentScope } from '@/lib/permissions';

import { trialCountdown } from './trialCountdown';

/**
 * Is the trial banner showing right now?
 *
 * The shell needs this separately from the component, because on mobile the
 * banner carries the status-bar inset and `Screen` must then skip it — so the
 * layout has to know before the banner renders itself.
 */
export function useTrialBannerVisible(): boolean {
  const { business } = useCurrentScope();
  // Owner-only in practice: nobody else holds settings.billing.
  const canSeeBilling = usePermission('settings.billing');

  const { shouldWarn } = trialCountdown(business?.trial_ends_at ?? null, business?.status ?? null);

  return shouldWarn && canSeeBilling.allowed;
}
