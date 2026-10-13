import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { useMyFeatures } from '@/features/plans/api/useMyFeatures';
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

/** A role change invalidates this alongside `grantKeys` — same cache lifetime, same trigger. */
export const roleLabelKeys = {
  forBusiness: (businessId: string) => ['role-labels', businessId] as const,
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
  const features = useMyFeatures(businessId);

  const isSuperAdmin = profile.data?.is_super_admin === true;

  const set: GrantSet = {
    businessId: businessId ?? '',
    grants: grants.data ?? [],
    isActive: isBusinessActive(business?.status ?? null, business?.trial_ends_at ?? null),
    // The server's answer; null (loading / failed) keeps every gated feature off.
    features: features.data?.features ?? null,
    isSuperAdmin,
  };

  return {
    set,
    isPending:
      scopePending ||
      profile.isPending ||
      (Boolean(businessId) && (grants.isPending || features.isPending)),
    error: grants.error ?? (profile.error as Error | null) ?? null,
  };
}

/** One row of `my_role_labels()`: a role the signed-in member holds, where, and how big it is. */
type RoleLabelRow = {
  roleName: string;
  branchId: string | null;
  permissionCount: number;
};

function useRoleLabelRows(businessId: string | null): UseQueryResult<RoleLabelRow[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: businessId ? roleLabelKeys.forBusiness(businessId) : ['role-labels', 'none'],
    enabled: isAuthenticated && Boolean(businessId),
    // Roles change rarely, and a role change invalidates grantKeys for the same reason.
    staleTime: staleTimes.staticLong,
    queryFn: async () => {
      if (!businessId) return [];
      const { data, error } = await getSupabase().rpc('my_role_labels', {
        p_business_id: businessId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        roleName: row.role_name,
        branchId: row.branch_id ?? null,
        permissionCount: row.permission_count,
      }));
    },
  });
}

/**
 * The display label for the signed-in member's role in the current business —
 * the role for the selected branch, or, if none is selected, the one with the
 * most permissions (robust for a custom role, which has no fixed rank).
 *
 * Display only, like `my_grants()`: never a permission check.
 */
export function useMyRoleLabel(): { label: string | null; isPending: boolean } {
  const { businessId, branchId, isPending: scopePending } = useCurrentScope();
  const roles = useRoleLabelRows(businessId);
  const rows = roles.data ?? [];

  const matchingBranch = branchId ? rows.filter((row) => row.branchId === branchId) : [];
  // A role assigned to "every branch" (branchId null) still applies at a selected branch.
  const everyBranch = rows.filter((row) => row.branchId === null);
  const candidates = branchId ? [...matchingBranch, ...everyBranch] : rows;

  const best = candidates.reduce<RoleLabelRow | null>((top, row) => {
    if (!top || row.permissionCount > top.permissionCount) return row;
    return top;
  }, null);

  return {
    label: best?.roleName ?? null,
    isPending: scopePending || (Boolean(businessId) && roles.isPending),
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
