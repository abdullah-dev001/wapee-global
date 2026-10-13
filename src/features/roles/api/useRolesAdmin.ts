import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { memberKeys, roleKeys } from '@/features/members/api/useMembers';
import { invalidateMyFeatures } from '@/features/plans/api/useMyFeatures';
import { grantKeys, roleLabelKeys } from '@/lib/permissions';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';

import { draftFromRows, draftToPayload, type PermissionRow, type RoleDraft } from '../rolesLogic';

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: PermissionRow[];
  memberCount: number;
};

function parseRoles(data: unknown): RoleRow[] {
  const list = (data as { roles?: unknown }).roles;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry): RoleRow[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const r = entry as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.name !== 'string') return [];
    const perms = Array.isArray(r.permissions) ? r.permissions : [];
    return [
      {
        id: r.id,
        key: typeof r.key === 'string' ? r.key : '',
        name: r.name,
        isSystem: r.is_system === true,
        memberCount: typeof r.member_count === 'number' ? r.member_count : 0,
        permissions: perms.flatMap((p): PermissionRow[] => {
          if (typeof p !== 'object' || p === null) return [];
          const q = p as Record<string, unknown>;
          return typeof q.permission === 'string' &&
            (q.scope === 'own' || q.scope === 'branch' || q.scope === 'all')
            ? [{ permission: q.permission, scope: q.scope }]
            : [];
        }),
      },
    ];
  });
}

/** Default + custom roles with their permissions and how many people hold each (`list_roles`). */
export function useRolesAdmin(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: roleKeys.list({ businessId: businessId ?? 'none', filters: { admin: true } }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.list,
    queryFn: async (): Promise<RoleRow[]> => {
      const { data, error } = await getSupabase().rpc('list_roles', {
        p_business_id: businessId ?? '',
      });
      return parseRoles(unwrapRpc(data, error));
    },
  });
}

/** A role change can change what people may do: refresh every cache that shows it. */
export function invalidateAfterRoleChange(queryClient: QueryClient, businessId: string) {
  void queryClient.invalidateQueries({ queryKey: roleKeys.business(businessId) });
  void queryClient.invalidateQueries({ queryKey: memberKeys.business(businessId) });
  void queryClient.invalidateQueries({ queryKey: grantKeys.forBusiness(businessId) });
  void queryClient.invalidateQueries({ queryKey: roleLabelKeys.forBusiness(businessId) });
  void invalidateMyFeatures(queryClient, businessId);
}

export type SaveRoleInput = {
  /** Present when editing. */
  roleId?: string;
  name: string;
  draft: RoleDraft;
  /** Only when creating from a default or custom role. */
  cloneFrom?: string | null;
};

export type SaveRoleResult = { roleId: string; stripped: string[] };

export function useSaveRole(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<SaveRoleResult, Error, SaveRoleInput>({
    mutationFn: async (input) => {
      if (!businessId) throw new Error('No business selected');
      const supabase = getSupabase();
      const permissions = draftToPayload(input.draft);
      if (input.roleId) {
        const { data, error } = await supabase.rpc('update_custom_role', {
          p_role_id: input.roleId,
          p_name: input.name.trim(),
          p_permissions: permissions,
        });
        unwrapRpc(data, error);
        return { roleId: input.roleId, stripped: [] };
      }
      const { data, error } = await supabase.rpc('create_custom_role', {
        p_business_id: businessId,
        p_name: input.name.trim(),
        p_permissions: permissions,
        ...(input.cloneFrom ? { p_clone_from: input.cloneFrom } : {}),
      });
      const result = unwrapRpc<{ role_id: string; stripped?: unknown }>(data, error);
      return {
        roleId: result.role_id,
        stripped: Array.isArray(result.stripped) ? result.stripped.map(String) : [],
      };
    },
    onSuccess: () => {
      if (businessId) invalidateAfterRoleChange(queryClient, businessId);
    },
  });
}

export function useDeleteRole(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<
    { reassigned: number },
    Error,
    { roleId: string; replacementId: string | null }
  >({
    mutationFn: async ({ roleId, replacementId }) => {
      const { data, error } = await getSupabase().rpc('delete_custom_role', {
        p_role_id: roleId,
        ...(replacementId ? { p_replacement_role_id: replacementId } : {}),
      });
      const result = unwrapRpc<{ reassigned?: number }>(data, error);
      return { reassigned: result.reassigned ?? 0 };
    },
    onSuccess: () => {
      if (businessId) invalidateAfterRoleChange(queryClient, businessId);
    },
  });
}

export { draftFromRows };
