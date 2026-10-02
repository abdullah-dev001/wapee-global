import { useMemo } from 'react';

import { type PermissionKey } from '@/config/permissions';
import { hasPermission, useGrantSet } from '@/lib/permissions';

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
 * Roles the current user may grant when inviting someone.
 *
 * `enforce_role_assignment_guard` refuses an assignment carrying any permission
 * the granter does not hold, so offering such a role would only produce an error
 * after the fact. This filters the picker to what will actually work.
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

    const canGrant = (role: AssignableRole) =>
      role.permissions.every((permission) =>
        hasPermission(set, permission as PermissionKey, branchId),
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
