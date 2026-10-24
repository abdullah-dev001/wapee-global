import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import type { SubscriptionStatus } from '../featureLogic';

export const myBillingKeys = createQueryKeys('myBilling');

export type BillingInterval = 'month' | 'year';

/** The business's primary Polar plan subscription, or null on manual / trial / no plan. */
export type MyBillingPlan = {
  key: string;
  interval: BillingInterval;
  seats: number | null;
  polarStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** When past due: the day access ends if payment is not fixed. */
  pastDueUntil: string | null;
};

export type MyBillingAddon = {
  key: string;
  interval: BillingInterval;
  polarStatus: string;
  cancelAtPeriodEnd: boolean;
  accessUntil: string | null;
};

export type MyBilling = {
  status: SubscriptionStatus;
  billingSource: 'manual' | 'polar';
  currentPlan: string | null;
  trialEndsAt: string | null;
  periodEnd: string | null;
  hasBillingAccount: boolean;
  plan: MyBillingPlan | null;
  addons: MyBillingAddon[];
};

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asInterval = (v: unknown): BillingInterval => (v === 'year' ? 'year' : 'month');

function mapPlan(v: unknown): MyBillingPlan | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  return {
    key: str(p.key) ?? '',
    interval: asInterval(p.interval),
    seats: typeof p.seats === 'number' ? p.seats : null,
    polarStatus: str(p.polar_status) ?? '',
    cancelAtPeriodEnd: p.cancel_at_period_end === true,
    currentPeriodStart: str(p.current_period_start),
    currentPeriodEnd: str(p.current_period_end),
    pastDueUntil: str(p.past_due_until),
  };
}

function mapAddon(v: unknown): MyBillingAddon {
  const a = (v ?? {}) as Record<string, unknown>;
  return {
    key: str(a.key) ?? '',
    interval: asInterval(a.interval),
    polarStatus: str(a.polar_status) ?? '',
    cancelAtPeriodEnd: a.cancel_at_period_end === true,
    accessUntil: str(a.access_until),
  };
}

/** The Owner billing screen's live Polar state (`get_my_billing`): plan + add-ons, flags, periods. */
export function useMyBilling(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery<MyBilling>({
    queryKey: myBillingKeys.detail({ businessId: businessId ?? 'none' }, 'state'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.list,
    queryFn: async (): Promise<MyBilling> => {
      const { data, error } = await getSupabase().rpc('get_my_billing', {
        p_business_id: businessId ?? '',
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as Record<string, unknown>;
      if (r.ok !== true) throw new Error(str(r.code) ?? 'forbidden');
      return {
        status: (str(r.status) ?? 'trialing') as SubscriptionStatus,
        billingSource: r.billing_source === 'polar' ? 'polar' : 'manual',
        currentPlan: str(r.current_plan),
        trialEndsAt: str(r.trial_ends_at),
        periodEnd: str(r.period_end),
        hasBillingAccount: r.has_billing_account === true,
        plan: mapPlan(r.plan),
        addons: Array.isArray(r.addons) ? r.addons.map(mapAddon) : [],
      };
    },
  });
}
