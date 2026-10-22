import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { invalidateMyFeatures } from '@/features/plans/api/useMyFeatures';
import { grantKeys, roleLabelKeys } from '@/lib/permissions';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';
import { type Database } from '@/lib/supabase/database.types';

import { type AddMemberValues } from '../schemas/addMember.schemas';

type MemberStatus = Database['public']['Enums']['member_status'];

export const memberKeys = createQueryKeys('members');
export const roleKeys = createQueryKeys('roles');

export type MemberRow = {
  id: string;
  status: MemberStatus;
  invitedEmail: string | null;
  invitedAt: string;
  inviteExpiresAt: string | null;
  joinedAt: string | null;
  userId: string | null;
  fullName: string | null;
  email: string | null;
  roles: { assignmentId: string; roleId: string; roleName: string; branchId: string | null }[];
};

/** Everyone in the business: active members and pending invites. */
export function useMembers(businessId: string | null): UseQueryResult<MemberRow[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: memberKeys.list({ businessId: businessId ?? 'none' }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.list,
    queryFn: async () => {
      // RLS limits this to businesses the caller is a member of.
      const { data, error } = await getSupabase()
        .from('business_members')
        // One literal, not a concatenation: supabase-js infers the row type from
        // the string itself. `business_members` has two FKs to profiles
        // (user_id, invited_by), so the embed names the constraint.
        .select(
          'id, status, invited_email, invite_expires_at, joined_at, created_at, user_id, profiles!business_members_user_id_fkey(full_name, email), member_role_assignments(id, role_id, branch_id, roles(name))',
        )
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);

      // `profiles` RLS shows only your own row, so teammates' names come from a
      // function that returns name + email of THIS business's active members only.
      const names = await getSupabase().rpc('list_business_member_names', {
        p_business_id: businessId ?? '',
      });
      if (names.error) throw new Error(names.error.message);
      const nameByUser = new Map((names.data ?? []).map((n) => [n.user_id, n]));

      return (data ?? []).map((row) => ({
        id: row.id,
        status: row.status,
        invitedEmail: row.invited_email,
        invitedAt: row.created_at,
        inviteExpiresAt: row.invite_expires_at,
        joinedAt: row.joined_at,
        userId: row.user_id,
        fullName:
          (row.user_id ? nameByUser.get(row.user_id)?.full_name : null) ??
          row.profiles?.full_name ??
          null,
        email:
          (row.user_id ? nameByUser.get(row.user_id)?.email : null) ??
          row.profiles?.email ??
          row.invited_email,
        roles: (row.member_role_assignments ?? []).map((assignment) => ({
          assignmentId: assignment.id,
          roleId: assignment.role_id,
          roleName: assignment.roles?.name ?? '',
          branchId: assignment.branch_id,
        })),
      }));
    },
  });
}

export type AssignableRole = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  /** The role's permission keys, used to check the inviter can grant them. */
  permissions: string[];
  /** The same with each scope, so "can the inviter grant it AT THAT SCOPE" is exact. */
  permissionRows: { permission: string; scope: 'own' | 'branch' | 'all' }[];
};

/** System roles plus this business's custom roles, with their permissions. */
export function useRoles(businessId: string | null): UseQueryResult<AssignableRole[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: roleKeys.list({ businessId: businessId ?? 'none' }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      // RLS already limits this to system roles plus the caller's own business.
      const { data, error } = await getSupabase()
        .from('roles')
        .select('id, key, name, is_system, role_permissions(permission, scope)')
        .order('name');
      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        isSystem: row.is_system,
        permissions: (row.role_permissions ?? []).map((entry) => entry.permission),
        permissionRows: (row.role_permissions ?? []).map((entry) => ({
          permission: entry.permission,
          scope: entry.scope,
        })),
      }));
    },
  });
}

export type AddMemberResult = {
  memberId: string;
  /** When the pending add stops being claimable (30 days; "resend" renews it). */
  expiresAt: string;
};

/**
 * Adds someone by email (`add_member_by_email`). There is no link or token: the database stores a
 * pending membership bound to the email and queues a plain "you were added" email; the person joins
 * when they sign in with that VERIFIED email (`useClaimPendingMemberships`). Re-adding the same
 * email replaces the role and renews the expiry ("resend").
 */
export function useAddMember(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<AddMemberResult, Error, AddMemberValues>({
    mutationFn: async (values) => {
      if (!businessId) throw new Error('No business selected');

      const { data, error } = await getSupabase().rpc('add_member_by_email', {
        p_business_id: businessId,
        p_email: values.email,
        p_role_id: values.roleId,
        ...(values.branchId ? { p_branch_id: values.branchId } : {}),
        ...(values.staffId ? { p_staff_id: values.staffId } : {}),
      });
      // {ok:false, code} becomes an RpcError, mapped by memberAddErrorKey().
      const result = unwrapRpc<{ member_id: string; expires_at: string }>(data, error);
      return { memberId: result.member_id, expiresAt: result.expires_at };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: memberKeys.lists({ businessId: businessId ?? 'none' }),
      });
      // The chosen staff profile now points at the pending member.
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Member administration (Phase 9B). Every action is an RPC that re-checks the
// caller in the database ("nobody grants what they lack", last Owner, audit).
// ---------------------------------------------------------------------------

function refreshAfterMemberChange(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: string,
) {
  void queryClient.invalidateQueries({ queryKey: memberKeys.business(businessId) });
  void queryClient.invalidateQueries({ queryKey: roleKeys.business(businessId) });
  void queryClient.invalidateQueries({ queryKey: grantKeys.forBusiness(businessId) });
  void queryClient.invalidateQueries({ queryKey: roleLabelKeys.forBusiness(businessId) });
  void invalidateMyFeatures(queryClient, businessId);
}

/** Give a member a role, for one location or all of them (`branchId` null). */
export function useAssignMemberRole(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<
    undefined,
    Error,
    { memberId: string; roleId: string; branchId: string | null }
  >({
    mutationFn: async ({ memberId, roleId, branchId }) => {
      const { data, error } = await getSupabase().rpc('assign_member_role', {
        p_member_id: memberId,
        p_role_id: roleId,
        ...(branchId ? { p_branch_id: branchId } : {}),
      });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      if (businessId) refreshAfterMemberChange(queryClient, businessId);
    },
  });
}

export function useRemoveMemberRole(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<undefined, Error, { assignmentId: string }>({
    mutationFn: async ({ assignmentId }) => {
      const { data, error } = await getSupabase().rpc('remove_member_role', {
        p_assignment_id: assignmentId,
      });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      if (businessId) refreshAfterMemberChange(queryClient, businessId);
    },
  });
}

/** Take someone out of the business (they lose every permission at once). */
export function useRemoveMember(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<undefined, Error, { memberId: string }>({
    mutationFn: async ({ memberId }) => {
      const { data, error } = await getSupabase().rpc('remove_member', { p_member_id: memberId });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      if (businessId) refreshAfterMemberChange(queryClient, businessId);
    },
  });
}

export function useRevokeInvite(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<undefined, Error, { memberId: string }>({
    mutationFn: async ({ memberId }) => {
      const { data, error } = await getSupabase().rpc('revoke_invite', { p_member_id: memberId });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      if (businessId) refreshAfterMemberChange(queryClient, businessId);
    },
  });
}
