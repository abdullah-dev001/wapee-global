import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

/**
 * Is the signed-in member an Owner or Manager? The single source of truth
 * for the Reopen button's visibility — `is_owner_or_manager()` is the SAME
 * function `reopen_appointment` calls internally to gate the action itself
 * (context/appointments.md), so this can never drift from what the RPC
 * actually allows. Previously the UI used `usePermission('staff.manage')`
 * as a correct-by-coincidence stand-in; this reads the real role check.
 */
export function useIsOwnerOrManager(
  businessId: string | null,
  branchId: string | null,
): UseQueryResult<boolean, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: ['is-owner-or-manager', businessId ?? 'none', branchId ?? 'none'],
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.staticLong,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('is_owner_or_manager', {
        p_business_id: businessId ?? '',
        p_branch_id: branchId ?? undefined,
      });
      if (error) throw error;
      return data ?? false;
    },
  });
}
