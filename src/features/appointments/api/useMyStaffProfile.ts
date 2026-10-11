import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

/**
 * The signed-in member's own `staff_profiles.id` in this business, or null if
 * they have none (not a staff member, or Branch/All scope with no profile).
 *
 * Reads the SAME `my_staff_profile_id()` the write RPCs use to force
 * Own-scope `staff_id` server-side (context/appointments.md) — this is only
 * for the UI (locking the staff column, pre-selecting the create form); the
 * RPC enforces the real rule regardless of what this returns.
 */
export function useMyStaffProfile(businessId: string | null): UseQueryResult<string | null, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: ['my-staff-profile', businessId ?? 'none'],
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.staticLong,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('my_staff_profile_id', {
        p_business_id: businessId ?? '',
      });
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });
}
