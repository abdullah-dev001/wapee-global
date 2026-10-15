import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { branchBookableKeys } from '@/features/booking-settings/api/useBookingSettings';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';
import { type LocalDate, type MinuteOfDay } from '@/lib/time';

export const branchScheduleKeys = createQueryKeys('branch-schedule');
export const resourceKeys = createQueryKeys('resources');

export type BranchHour = {
  id: string;
  dayOfWeek: number;
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
};

export type BranchClosure = {
  id: string;
  startsOn: LocalDate;
  endsOn: LocalDate;
  name: string;
};

/** When the branch is open, and when it is shut. */
export function useBranchSchedule(
  businessId: string | null,
  branchId: string | null,
): UseQueryResult<{ hours: BranchHour[]; closures: BranchClosure[] }, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: branchScheduleKeys.detail({ businessId: businessId ?? 'none' }, branchId ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const supabase = getSupabase();
      const [hours, closures] = await Promise.all([
        supabase
          .from('branch_hours')
          .select('id, day_of_week, start_minute, end_minute')
          .eq('branch_id', branchId ?? '')
          .order('day_of_week')
          .order('start_minute'),
        supabase
          .from('branch_closures')
          .select('id, starts_on, ends_on, name')
          .eq('branch_id', branchId ?? '')
          // Past closures are history; only what is current or ahead matters.
          .gte('ends_on', new Date().toISOString().slice(0, 10))
          .order('starts_on'),
      ]);

      if (hours.error) throw Object.assign(new Error(hours.error.message), { code: hours.error.code });
      if (closures.error) throw Object.assign(new Error(closures.error.message), { code: closures.error.code });

      return {
        hours: (hours.data ?? []).map((row) => ({
          id: row.id,
          dayOfWeek: row.day_of_week,
          startMinute: row.start_minute,
          endMinute: row.end_minute,
        })),
        closures: (closures.data ?? []).map((row) => ({
          id: row.id,
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          name: row.name,
        })),
      };
    },
  });
}

/**
 * How many future appointments at this branch (any staff member) would fall
 * outside the given candidate opening-hours intervals. Called right before
 * saving, same imperative warn-and-proceed use as
 * `getStaffScheduleConflicts` — nothing is deleted or hidden either way, so
 * this warns rather than refuses (decided with the user, Feature 10).
 */
export async function getBranchHoursConflicts(
  branchId: string,
  intervals: { dayOfWeek: number; startMinute: MinuteOfDay; endMinute: MinuteOfDay }[],
): Promise<number> {
  const { data, error } = await getSupabase().rpc('branch_hours_conflicts', {
    p_branch_id: branchId,
    p_intervals: intervals.map((interval) => ({
      day_of_week: interval.dayOfWeek,
      start_minute: interval.startMinute,
      end_minute: interval.endMinute,
    })),
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data ?? 0;
}

/**
 * Replaces the branch's whole week, **in one transaction**.
 *
 * Runs through the `replace_branch_hours` RPC for the same reason as the staff
 * schedule: a two-request delete-then-insert could leave the week empty if the
 * insert failed (migration 20261002190000). SECURITY INVOKER, so RLS applies,
 * and the RPC re-checks `settings.business` to give a clear error.
 */
export function useSaveBranchHours(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<
    number,
    Error,
    { intervals: { dayOfWeek: number; startMinute: MinuteOfDay; endMinute: MinuteOfDay }[] }
  >({
    mutationFn: async ({ intervals }) => {
      if (!businessId || !branchId) throw new Error('No branch selected');

      const { data, error } = await getSupabase().rpc('replace_branch_hours', {
        p_branch_id: branchId,
        p_intervals: intervals.map((interval) => ({
          day_of_week: interval.dayOfWeek,
          start_minute: interval.startMinute,
          end_minute: interval.endMinute,
        })),
      });

      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data ?? 0;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: branchScheduleKeys.business(businessId ?? 'none'),
      });
      // Opening hours are one of the branch_is_bookable() requirements.
      void queryClient.invalidateQueries({
        queryKey: branchBookableKeys.business(businessId ?? 'none'),
      });
    },
  });
}

/**
 * How many future appointments at this branch fall inside a candidate
 * closure's inclusive local-date range. Same imperative, warn-and-proceed use
 * as `getBranchHoursConflicts`.
 */
export async function getBranchClosureConflicts(
  branchId: string,
  startsOn: LocalDate,
  endsOn: LocalDate,
): Promise<number> {
  const { data, error } = await getSupabase().rpc('branch_closure_conflicts', {
    p_branch_id: branchId,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data ?? 0;
}

/** Adds a holiday or closed period. The DB refuses an overlap. */
export function useSaveClosure(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { startsOn: LocalDate; endsOn: LocalDate; name: string }>({
    mutationFn: async ({ startsOn, endsOn, name }) => {
      if (!businessId || !branchId) throw new Error('No branch selected');
      const { data, error } = await getSupabase()
        .from('branch_closures')
        .insert({
          branch_id: branchId,
          business_id: businessId,
          starts_on: startsOn,
          ends_on: endsOn,
          name,
        })
        .select('id')
        .single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: branchScheduleKeys.business(businessId ?? 'none'),
      });
    },
  });
}

/** Removes a closure. A hard delete: there is no history in a closed day. */
export function useDeleteClosure(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<undefined, Error, string>({
    mutationFn: async (id) => {
      const { error } = await getSupabase().from('branch_closures').delete().eq('id', id);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return undefined;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: branchScheduleKeys.business(businessId ?? 'none'),
      });
    },
  });
}

export type Resource = {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
};

/**
 * Rooms, chairs and bays at the branch.
 *
 * Stored now; **nothing consumes them until the Phase 3 slot engine**, and the
 * booking setting that turns them on does not exist yet.
 */
export function useResources(
  businessId: string | null,
  branchId: string | null,
): UseQueryResult<Resource[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: resourceKeys.list({ businessId: businessId ?? 'none', branchId }),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('resources')
        .select('id, name, capacity, is_active')
        .eq('branch_id', branchId ?? '')
        .is('deleted_at', null)
        .order('name');
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        capacity: row.capacity,
        isActive: row.is_active,
      }));
    },
  });
}

/** Adds a resource. */
export function useSaveResource(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { name: string; capacity: number }>({
    mutationFn: async ({ name, capacity }) => {
      if (!businessId || !branchId) throw new Error('No branch selected');
      const { data, error } = await getSupabase()
        .from('resources')
        .insert({ business_id: businessId, branch_id: branchId, name, capacity })
        .select('id')
        .single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resourceKeys.business(businessId ?? 'none'),
      });
    },
  });
}

/**
 * Soft-deletes a resource. Goes through the `archive_resource` RPC (not a
 * direct update): it refuses while a future pending/confirmed appointment is
 * still assigned to it — `use_resources` is reachable and toggleable in
 * Booking Settings today, so a real appointment can carry this resource's id,
 * and archiving must never silently leave it pointing at a resource nobody
 * can see any more (same reasoning as `archive_staff`).
 */
export function useDeleteResource(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<undefined, Error, string>({
    mutationFn: async (id) => {
      const { data, error } = await getSupabase().rpc('archive_resource', { p_resource_id: id });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: resourceKeys.business(businessId ?? 'none'),
      });
    },
  });
}
