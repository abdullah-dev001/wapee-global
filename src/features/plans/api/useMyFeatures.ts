import { useQuery, type QueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { parsePlanSnapshot, type PlanSnapshot } from '../featureLogic';

export const featureKeys = createQueryKeys('my-features');
export const planUsageKeys = createQueryKeys('plan-usage');

/**
 * `my_features()`: plan, status, caps and the on/off map for ONE business. The
 * server computes it (`business_has_feature`); the client never re-derives it.
 *
 * Refreshed within a minute, on every app focus, and explicitly on a role or plan
 * change via `invalidateMyFeatures`. A failed read leaves it unknown, which keeps
 * every gated feature OFF.
 */
export function useMyFeatures(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: featureKeys.detail({ businessId: businessId ?? 'none' }, 'me'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.listLong,
    queryFn: async (): Promise<PlanSnapshot | null> => {
      const { data, error } = await getSupabase().rpc('my_features', {
        p_business_id: businessId ?? '',
      });
      if (error) throw new Error(error.message);
      return parsePlanSnapshot(data);
    },
  });
}

export function invalidateMyFeatures(queryClient: QueryClient, businessId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: featureKeys.scope({ businessId }) });
}

export type PlanUsageBranch = { id: string; name: string; activeStaff: number };
export type PlanUsage = {
  staffCap: number | null;
  maxBranches: number | null;
  branchCount: number;
  branches: PlanUsageBranch[];
};

/** `my_plan_usage()`: active staff per location, counted by the same rule as the cap trigger. */
export function usePlanUsage(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: planUsageKeys.detail({ businessId: businessId ?? 'none' }, 'me'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.list,
    queryFn: async (): Promise<PlanUsage | null> => {
      const { data, error } = await getSupabase().rpc('my_plan_usage', {
        p_business_id: businessId ?? '',
      });
      if (error) throw new Error(error.message);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
      const d = data as Record<string, unknown>;
      const branches = Array.isArray(d.branches) ? d.branches : [];
      return {
        staffCap: typeof d.staff_cap === 'number' ? d.staff_cap : null,
        maxBranches: typeof d.max_branches === 'number' ? d.max_branches : null,
        branchCount: typeof d.branch_count === 'number' ? d.branch_count : branches.length,
        branches: branches.flatMap((b) => {
          if (typeof b !== 'object' || b === null) return [];
          const r = b as Record<string, unknown>;
          return typeof r.id === 'string' && typeof r.name === 'string'
            ? [
                {
                  id: r.id,
                  name: r.name,
                  activeStaff: typeof r.active_staff === 'number' ? r.active_staff : 0,
                },
              ]
            : [];
        }),
      };
    },
  });
}
