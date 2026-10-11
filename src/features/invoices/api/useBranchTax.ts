import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

export const branchTaxKeys = createQueryKeys('branch-tax');

/** The branch's tax rate (basis points) and tax number, for the draft editor's preview. The server recalculates on save. */
export function useBranchTax(businessId: string | null, branchId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: branchTaxKeys.detail(
      { businessId: businessId ?? 'none', branchId },
      branchId ?? 'none',
    ),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('branches')
        .select('tax_rate_bp, tax_number')
        .eq('id', branchId ?? '')
        .single();
      if (error) throw new Error(error.message);
      return { taxRateBp: data.tax_rate_bp, taxNumber: data.tax_number };
    },
  });
}
