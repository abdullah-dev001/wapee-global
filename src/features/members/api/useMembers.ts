import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { invalidateMyFeatures } from '@/features/plans/api/useMyFeatures';
import { grantKeys, roleLabelKeys } from '@/lib/permissions';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';
import { type Database } from '@/lib/supabase/database.types';

import { buildInviteUrl } from '../inviteUrl';
import { type InviteValues } from '../schemas/invite.schemas';

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

export type InviteResult = {
  memberId: string;
  /** Shown to the inviter ONCE. Never stored by the app. */
  token: string;
  expiresAt: string;
  /** The full link to copy and send. */
  url: string;
};

/**
 * Creates the invite and returns the link.
 *
 * The raw token exists only in this result and in whatever the inviter copies —
 * the database keeps a sha256 hash. There is no way to re-read it later, so
 * losing it means sending a fresh invite (which replaces the old one).
 */
export function useInviteMember(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<InviteResult, Error, InviteValues>({
    mutationFn: async (values) => {
      if (!businessId) throw new Error('No business selected');

      const { data, error } = await getSupabase().rpc('invite_member', {
        p_business_id: businessId,
        p_email: values.email,
        p_role_id: values.roleId,
        ...(values.branchId ? { p_branch_id: values.branchId } : {}),
        ...(values.staffId ? { p_staff_id: values.staffId } : {}),
      });
      if (error) {
        // invite_member raises (Postgres errcode), not the {ok,code} shape —
        // keep the code so inviteMemberErrorKey() can map it to an i18n key.
        const wrapped = new Error(error.message) as Error & { code?: string };
        wrapped.code = error.code;
        throw wrapped;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('The invite was not created');

      // The OUT columns carry an `out_` prefix so they cannot collide with a
      // table column inside the function (see the 20261002162000 migration).
      return {
        memberId: row.out_member_id,
        token: row.out_token,
        expiresAt: row.out_expires_at,
        url: buildInviteUrl(row.out_token),
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: memberKeys.lists({ businessId: businessId ?? 'none' }),
      });
      // The chosen staff profile now points at the invited member.
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });
}

/**
 * Thrown for any invite that cannot be accepted. The reason is deliberately not
 * carried: unknown, used, expired and wrong-account all look the same, so the
 * screen cannot be used to discover which tokens or emails exist.
 */
export class InviteNotValidError extends Error {
  constructor() {
    super('INVITE_NOT_VALID');
    this.name = 'InviteNotValidError';
  }
}

/** Accepts an invite as the signed-in user, then refreshes what they can see. */
export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, string>({
    mutationFn: async (token) => {
      const { data, error } = await getSupabase().rpc('accept_invite', { p_token: token });
      if (error) throw new Error(error.message);
      // The RPC returns null for every failure rather than raising, so the
      // rate-limit counter is not rolled back (see migration 20261002163000).
      if (!data) throw new InviteNotValidError();
      return data;
    },
    onSuccess: (businessId) => {
      // The user is now in a business they were not in a moment ago: their
      // membership list and their permission set both change.
      void queryClient.invalidateQueries({ queryKey: ['businesses', 'mine'] });
      void queryClient.invalidateQueries({ queryKey: grantKeys.forBusiness(businessId) });
      void queryClient.invalidateQueries({ queryKey: roleLabelKeys.forBusiness(businessId) });
      // A role or membership change can also change what the plan lets this member use.
      void invalidateMyFeatures(queryClient, businessId);
    },
  });
}

/** Business name + invited email for an invite link, before signing in. */
export function useInvitePreview(token: string | null) {
  return useQuery({
    queryKey: ['invite-preview', token],
    enabled: Boolean(token),
    // A link is opened once; no point holding it.
    staleTime: staleTimes.liveShort,
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('invite_preview', {
        p_token: token ?? '',
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      // No row = bad, used or expired token. The screen shows one generic message.
      return row
        ? {
            businessName: row.business_name,
            invitedEmail: row.invited_email,
            expiresAt: row.expires_at,
          }
        : null;
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
