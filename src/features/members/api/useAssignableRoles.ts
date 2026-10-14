import { useMemo } from 'react';

import { type PermissionKey } from '@/config/permissions';
import { heldRankAtBranch, scopeRank } from '@/features/roles/rolesLogic';
import { useGrantSet } from '@/lib/permissions';

import { useRoles, type AssignableRole } from './useMembers';

export type AssignableRolesResult = {
  /** Roles the inviter may actually grant. */
  roles: AssignableRole[];
  /** Roles that exist but are out of reach, so the UI can explain the gap. */
  blocked: AssignableRole[];
  isPending: boolean;
  error: Error | null;
};

/**
 * Roles the current user may grant when inviting someone, or assigning a role
 * to an existing member, AT ONE TARGET BRANCH (`branchId`; `null` = "every
 * branch", the same meaning it has in the picker and in `assign_member_role`).
 *
 * `enforce_role_assignment_guard` refuses an assignment carrying any permission
 * the granter does not hold AT THAT BRANCH (`can_grant_at`), so offering such a
 * role for that branch would only produce an error after the fact. This filters
 * the picker to what will actually work there — pass the branch the caller has
 * currently selected in the form, and recompute as they change it.
 *
 * **The guard is still the boundary** — this is the UI being honest, not a check
 * (CLAUDE.md §7). A super admin sees everything, as they pass the guard.
 */
export function useAssignableRoles(
  businessId: string | null,
  branchId: string | null = null,
): AssignableRolesResult {
  const roles = useRoles(businessId);
  const { set, isPending: grantsPending } = useGrantSet();

  const { roles: allowed, blocked } = useMemo(() => {
    const list = roles.data ?? [];
    if (set.isSuperAdmin) return { roles: list, blocked: [] as AssignableRole[] };

    // Scope-aware, like the database: you may grant a permission only at a reach
    // you hold yourself, AT the branch this assignment targets (a Branch-scope
    // manager at branch A cannot hand out a role at branch B, or "every branch").
    const canGrant = (role: AssignableRole) =>
      role.permissionRows.every(
        (row) =>
          heldRankAtBranch(set.grants, row.permission as PermissionKey, branchId, false) >=
          scopeRank(row.scope),
      );

    return {
      roles: list.filter(canGrant),
      blocked: list.filter((role) => !canGrant(role)),
    };
  }, [roles.data, set, branchId]);

  return {
    roles: allowed,
    blocked,
    isPending: roles.isPending || grantsPending,
    error: (roles.error as Error | null) ?? null,
  };
}
