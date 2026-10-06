import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

export const billingKeys = createQueryKeys('billing');

export type CatalogueName = { key: string; name: string };

export type BillingInfo = {
  /** Plan names as the super admin has them (editable), keyed by plan key. */
  planNames: Record<string, string>;
  addons: CatalogueName[];
  /** Null on trial / lapsed trial. */
  periodEnd: string | null;
  periodStart: string | null;
};

/** What the Owner's billing screen shows beyond `my_features()`: names + period. */
export function useBillingInfo(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: billingKeys.detail({ businessId: businessId ?? 'none' }, 'info'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async (): Promise<BillingInfo> => {
      const supabase = getSupabase();
      const [plans, addons, sub] = await Promise.all([
        supabase.from('plans').select('key, name').order('sort_order'),
        supabase.from('addons').select('key, name').order('sort_order'),
        supabase
          .from('business_subscriptions')
          .select('current_period_start, current_period_end')
          .eq('business_id', businessId ?? '')
          .maybeSingle(),
      ]);
      if (plans.error) throw new Error(plans.error.message);
      if (addons.error) throw new Error(addons.error.message);
      if (sub.error) throw new Error(sub.error.message);
      return {
        planNames: Object.fromEntries((plans.data ?? []).map((p) => [p.key, p.name])),
        addons: addons.data ?? [],
        periodStart: sub.data?.current_period_start ?? null,
        periodEnd: sub.data?.current_period_end ?? null,
      };
    },
  });
}
