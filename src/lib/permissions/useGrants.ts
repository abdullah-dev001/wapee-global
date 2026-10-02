import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { type Grant, type GrantSet } from './types';
import { useCurrentScope, useMyProfile } from './useCurrentScope';

/**
 * The signed-in member's permission set for the current business.
 *
 * Read once per business and cached for the session's practical lifetime
 * (product doc §9: "permission sets cached per session, refreshed on role
 * change"). A role change invalidates `grantKeys.forBusiness(id)`.
 */

export const grantKeys = {
  all: ['grants'] as const,
  forBusiness: (businessId: string) => ['grants', businessId] as const,
};

/** Raw `my_grants()` rows for one business. */
function useGrantRows(businessId: string | null): UseQueryResult<Grant[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: grantKeys.forBusiness(businessId ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId),
    // Roles change rarely, and a change invalidates this key explicitly.
    staleTime: staleTimes.staticLong,
    queryFn: async () => {
      if (!businessId) return [];
      const { data, error } = await getSupabase().rpc('my_grants', {
        p_business_id: businessId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        permission: row.permission,
        scope: row.scope,
        // Postgres `null` means "every branch"; supabase-js types it as string.
        branchId: row.branch_id ?? null,
      }));
    },
  });
}

export type GrantSetResult = {
  /** Never null: an empty set denies everything, which is the safe default. */
  set: GrantSet;
  /** True while the grants, profile or business list are still loading. */
  isPending: boolean;
  error: Error | null;
};

/**
 * Everything `can()` needs: the grants, whether the business is active, its plan
 * and the super-admin flag.
 *
 * While it is pending the set denies everything, so nothing flashes into view
 * before the real answer arrives. Callers that must not flicker should check
 * `isPending` and render a skeleton.
 */
export function useGrantSet(): GrantSetResult {
  const { businessId, business, isPending: scopePending } = useCurrentScope();
  const profile = useMyProfile();
  const grants = useGrantRows(businessId);

  const isSuperAdmin = profile.data?.is_super_admin === true;

  const set: GrantSet = {
    businessId: businessId ?? '',
    grants: grants.data ?? [],
    isActive: isBusinessActive(business?.status ?? null, business?.trial_ends_at ?? null),
    // null during a trial: no plan assigned, so nothing is plan-gated.
    plan: business?.plan ?? null,
    isSuperAdmin,
  };

  return {
    set,
    isPending: scopePending || profile.isPending || (Boolean(businessId) && grants.isPending),
    error: grants.error ?? (profile.error as Error | null) ?? null,
  };
}

/**
 * Client-side mirror of SQL `business_is_active()`: active, or trialing with the
 * trial still running. Evaluated at render time, so a trial ending while the app
 * is open locks it on the next render, exactly as the database does per query.
 */
export function isBusinessActive(
  status: string | null,
  trialEndsAt: string | null,
  now: Date = new Date(),
): boolean {
  if (status === 'active') return true;
  if (status === 'trialing' && trialEndsAt) return new Date(trialEndsAt) > now;
  return false;
}
