import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

/**
 * How many appointments are pending approval right now, for the badge shown
 * to roles holding `appointments.approve` (Owner/Manager/Receptionist per
 * doc §9 — decided with the user: Staff never sees this, since they can't
 * act on it). RLS already scopes `appointments_select`, so a Branch-scoped
 * Manager only ever counts their own branch's pending rows.
 */
export function usePendingApprovalCount(
  businessId: string | null,
  branchId: string | null,
): UseQueryResult<number, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: ['appointments', 'pending-approval-count', businessId ?? 'none', branchId ?? 'none'],
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      let query = getSupabase()
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId ?? '')
        .eq('status', 'pending')
        .is('deleted_at', null);
      if (branchId) query = query.eq('branch_id', branchId);

      const { count, error } = await query;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}
