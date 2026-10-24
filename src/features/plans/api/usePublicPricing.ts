import { useQuery } from '@tanstack/react-query';

import { parsePublicPricing, type PublicPricing } from '@/features/landing/pricingModel';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

const pricingKeys = createQueryKeys('publicPricing');

/**
 * The public plan & add-on catalogue with prices (`get_public_pricing`), the same source the
 * landing page uses so the billing screen never hard-codes a price. Public data, cached long.
 */
export function usePublicPricing() {
  return useQuery<PublicPricing>({
    queryKey: pricingKeys.detail({ businessId: 'public' }, 'catalogue'),
    staleTime: staleTimes.staticLong,
    queryFn: async (): Promise<PublicPricing> => {
      const { data, error } = await getSupabase().rpc('get_public_pricing');
      if (error) throw new Error(error.message);
      const parsed = parsePublicPricing(data);
      if (!parsed) throw new Error('pricing_unavailable');
      return parsed;
    },
  });
}
