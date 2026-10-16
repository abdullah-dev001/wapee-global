import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { branchBookableKeys } from '@/features/booking-settings/api/useBookingSettings';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { rpcNull, unwrapRpc } from '@/lib/supabase/rpcResult';

import { type StaffValues } from '../schemas/staff.schemas';
import { StaffLinkError } from '../staffLogin';

export { StaffLinkError };

export const staffKeys = createQueryKeys('staff');

export type StaffListItem = {
  id: string;
  displayName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isBookableOnline: boolean;
  /** Null when this staff member has no app login — the common case. */
  memberId: string | null;
  branchIds: string[];
  serviceIds: string[];
  /** Branches where this person has at least one working-hours row. */
  hoursBranchIds: string[];
};

/**
 * The team, optionally limited to one branch.
 *
 * A staff member need not have a login (`member_id` is nullable), so this reads
 * `staff_profiles` and not `business_members` — see context/staff.md.
 */
export function useStaff(
  businessId: string | null,
  branchId: string | null,
  options: { search?: string; includeInactive?: boolean } = {},
): UseQueryResult<StaffListItem[], Error> {
  const { isAuthenticated } = useSession();
  const { search = '', includeInactive = true } = options;

  return useQuery({
    queryKey: staffKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      search,
      filters: { includeInactive },
    }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      let query = getSupabase()
        .from('staff_profiles')
        .select(
          'id, display_name, job_title, email, phone, is_active, is_bookable_online, member_id, sort_order, staff_branches(branch_id), service_staff(service_id), staff_working_hours(branch_id)',
        )
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null);

      if (search) query = query.ilike('display_name', `%${search}%`);
      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('sort_order').order('display_name');
      if (error) throw Object.assign(new Error(error.message), { code: error.code });

      const rows = (data ?? []).map((row) => ({
        id: row.id,
        displayName: row.display_name,
        jobTitle: row.job_title,
        email: row.email,
        phone: row.phone,
        isActive: row.is_active,
        isBookableOnline: row.is_bookable_online,
        memberId: row.member_id,
        branchIds: (row.staff_branches ?? []).map((entry) => entry.branch_id),
        serviceIds: (row.service_staff ?? []).map((entry) => entry.service_id),
        hoursBranchIds: [
          ...new Set((row.staff_working_hours ?? []).map((entry) => entry.branch_id)),
        ],
      }));

      // Filtering by branch in JS is safe here: a team is tens of rows, and the
      // branch list arrives in the same round trip. A server-side filter would
      // need a join that hides staff with no branch assigned yet.
      return branchId
        ? rows.filter((row) => row.branchIds.length === 0 || row.branchIds.includes(branchId))
        : rows;
    },
  });
}

function invalidateStaff(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: string | null,
) {
  void queryClient.invalidateQueries({
    queryKey: staffKeys.business(businessId ?? 'none'),
  });
  // Staff appearing / disappearing / being linked to services changes branch_is_bookable().
  void queryClient.invalidateQueries({
    queryKey: branchBookableKeys.business(businessId ?? 'none'),
  });
}

/**
 * Links a staff profile to an app login, or unlinks it (`memberId` null). Always goes through
 * the RPC: the column is closed to direct writes (context/staff.md).
 */
async function linkStaffMember(staffId: string, memberId: string | null): Promise<void> {
  const { data, error } = await getSupabase().rpc('link_staff_member', {
    p_staff_id: staffId,
    p_member_id: memberId ?? rpcNull<string>(),
  });
  unwrapRpc(data, error);
}

/** Creates or updates a staff profile, its branches and its services. */
export function useSaveStaff(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    // `memberId` is applied through `link_staff_member` only when it differs from
    // `originalMemberId`; a save that does not touch the login never calls it.
    StaffValues & { id?: string; originalMemberId?: string | null }
  >({
    mutationFn: async ({ memberId, originalMemberId, ...values }) => {
      if (!businessId) throw new Error('No business selected');
      const supabase = getSupabase();

      const fields = {
        business_id: businessId,
        display_name: values.displayName,
        job_title: values.jobTitle ?? null,
        email: values.email ?? null,
        phone: values.phone ?? null,
        is_active: values.isActive,
        is_bookable_online: values.isBookableOnline,
      };

      let staffId = values.id;
      if (staffId) {
        const { error } = await supabase.from('staff_profiles').update(fields).eq('id', staffId);
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
      } else {
        const { data, error } = await supabase
          .from('staff_profiles')
          .insert(fields)
          .select('id')
          .single();
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        staffId = data.id;
      }

      // Branch and service links are plain joins with no history, so replacing
      // them wholesale is simpler and safer than diffing.
      const { error: clearBranches } = await supabase
        .from('staff_branches')
        .delete()
        .eq('staff_id', staffId);
      if (clearBranches) {
        throw Object.assign(new Error(clearBranches.message), { code: clearBranches.code });
      }

      if (values.branchIds.length > 0) {
        const { error } = await supabase.from('staff_branches').insert(
          values.branchIds.map((branchId) => ({
            staff_id: staffId,
            branch_id: branchId,
            business_id: businessId,
          })),
        );
        if (error) {
          // A refused assignment (e.g. the plan's staff cap) must not leave a new,
          // active profile with no location behind: undo the profile we just made.
          if (!values.id) {
            await supabase
              .from('staff_profiles')
              .update({ is_active: false, deleted_at: new Date().toISOString() })
              .eq('id', staffId);
          }
          throw Object.assign(new Error(error.message), { code: error.code });
        }
      }

      const { error: clearServices } = await supabase
        .from('service_staff')
        .delete()
        .eq('staff_id', staffId);
      if (clearServices) {
        throw Object.assign(new Error(clearServices.message), { code: clearServices.code });
      }

      if (values.serviceIds.length > 0) {
        const { error } = await supabase.from('service_staff').insert(
          values.serviceIds.map((serviceId) => ({
            staff_id: staffId,
            service_id: serviceId,
            business_id: businessId,
          })),
        );
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
      }

      // Last: the profile is already saved, so a refused link (login already used,
      // not allowed) leaves a saved profile and tells the user only about the login.
      if (memberId !== (originalMemberId ?? null)) {
        try {
          await linkStaffMember(staffId, memberId);
        } catch (error) {
          throw new StaffLinkError(staffId, error);
        }
      }

      return staffId;
    },
    onSettled: () => {
      invalidateStaff(queryClient, businessId);
      // A service's staff list changed too.
      void queryClient.invalidateQueries({ queryKey: ['services'] });
      // "Own" data rules and the sidebar depend on who owns which profile.
      void queryClient.invalidateQueries({ queryKey: ['my-staff-profile'] });
    },
  });
}

/**
 * Soft-deletes a staff profile, keeping their history intact. Goes through the
 * `archive_staff` RPC (not a direct update): it refuses while the person has a
 * future pending/confirmed appointment, the same way `archive_branch` refuses
 * for a branch with future appointments — archiving must never silently orphan
 * an existing booking.
 */
export function useDeleteStaff(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<undefined, Error, string>({
    mutationFn: async (staffId) => {
      const { data, error } = await getSupabase().rpc('archive_staff', { p_staff_id: staffId });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => invalidateStaff(queryClient, businessId),
  });
}

/**
 * "Add me as staff": a bookable profile from the signed-in Owner's own name and email, assigned
 * to one branch and linked to their membership (RPC `add_me_as_staff`). Services and hours are
 * separate setup steps.
 */
export function useAddMeAsStaff(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<string, Error, undefined>({
    mutationFn: async () => {
      if (!businessId) throw new Error('No business selected');
      const { data, error } = await getSupabase().rpc('add_me_as_staff', {
        p_business_id: businessId,
        ...(branchId ? { p_branch_id: branchId } : {}),
      });
      const result = unwrapRpc<{ ok: true; staff_id: string }>(data, error);
      return result.staff_id;
    },
    onSuccess: () => {
      invalidateStaff(queryClient, businessId);
      void queryClient.invalidateQueries({ queryKey: ['my-staff-profile'] });
    },
  });
}
