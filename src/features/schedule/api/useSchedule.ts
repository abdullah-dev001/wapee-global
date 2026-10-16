import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { branchBookableKeys } from '@/features/booking-settings/api/useBookingSettings';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { type MinuteOfDay } from '@/lib/time';

export const scheduleKeys = createQueryKeys('schedule');

/** One stored interval. `id` is the database row. */
export type ScheduleInterval = {
  id: string;
  dayOfWeek: number;
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
  label?: string | null;
};

export type StaffSchedule = {
  workingHours: ScheduleInterval[];
  breaks: ScheduleInterval[];
};

/** One person's recurring hours and breaks at one branch. */
export function useStaffSchedule(
  businessId: string | null,
  branchId: string | null,
  staffId: string | null,
): UseQueryResult<StaffSchedule, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: scheduleKeys.detail(
      { businessId: businessId ?? 'none', branchId },
      staffId ?? 'none',
    ),
    enabled: isAuthenticated && Boolean(businessId && branchId && staffId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const supabase = getSupabase();

      const [hours, breaks] = await Promise.all([
        supabase
          .from('staff_working_hours')
          .select('id, day_of_week, start_minute, end_minute')
          .eq('staff_id', staffId ?? '')
          .eq('branch_id', branchId ?? '')
          .order('day_of_week')
          .order('start_minute'),
        supabase
          .from('staff_breaks')
          .select('id, day_of_week, start_minute, end_minute, label')
          .eq('staff_id', staffId ?? '')
          .eq('branch_id', branchId ?? '')
          .order('day_of_week')
          .order('start_minute'),
      ]);

      if (hours.error) throw Object.assign(new Error(hours.error.message), { code: hours.error.code });
      if (breaks.error) throw Object.assign(new Error(breaks.error.message), { code: breaks.error.code });

      return {
        workingHours: (hours.data ?? []).map((row) => ({
          id: row.id,
          dayOfWeek: row.day_of_week,
          startMinute: row.start_minute,
          endMinute: row.end_minute,
        })),
        breaks: (breaks.data ?? []).map((row) => ({
          id: row.id,
          dayOfWeek: row.day_of_week,
          startMinute: row.start_minute,
          endMinute: row.end_minute,
          label: row.label,
        })),
      };
    },
  });
}

export type SaveScheduleInput = {
  staffId: string;
  /** Every interval for the whole week, replacing what is stored. */
  intervals: { dayOfWeek: number; startMinute: MinuteOfDay; endMinute: MinuteOfDay }[];
  table: 'staff_working_hours' | 'staff_breaks';
};

/**
 * How many of this person's future appointments at this branch would fall
 * outside the given candidate working-hours intervals. Called right before
 * saving (not a query hook: it is imperative, one-shot, run from an event
 * handler) so the editor can warn with a count and let the owner proceed —
 * nothing is deleted or hidden either way, so this is a warning, not a
 * refusal (decided with the user). Breaks are not checked: they are
 * fine-grained and the slot engine already tolerates one outside working
 * hours with no effect (see context/schedule.md).
 */
export async function getStaffScheduleConflicts(
  staffId: string,
  branchId: string,
  intervals: SaveScheduleInput['intervals'],
): Promise<number> {
  const { data, error } = await getSupabase().rpc('staff_schedule_conflicts', {
    p_staff_id: staffId,
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
 * Replaces a person's week at one branch, **in one transaction**.
 *
 * The work happens in the `replace_staff_working_hours` /
 * `replace_staff_breaks` RPCs, so either the whole week is replaced or nothing
 * changes. The client used to DELETE then INSERT as two requests, which could
 * leave the week empty if the insert failed (migration 20261002190000).
 *
 * The RPCs are SECURITY INVOKER, so RLS still applies, and they re-check the
 * permission themselves to return a clear error instead of a silent no-op.
 */
export function useSaveStaffSchedule(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<number, Error, SaveScheduleInput>({
    mutationFn: async ({ staffId, intervals, table }) => {
      if (!businessId || !branchId) throw new Error('No branch selected');

      const payload = intervals.map((interval) => ({
        day_of_week: interval.dayOfWeek,
        start_minute: interval.startMinute,
        end_minute: interval.endMinute,
      }));

      const { data, error } =
        table === 'staff_working_hours'
          ? await getSupabase().rpc('replace_staff_working_hours', {
              p_staff_id: staffId,
              p_branch_id: branchId,
              p_intervals: payload,
            })
          : await getSupabase().rpc('replace_staff_breaks', {
              p_staff_id: staffId,
              p_branch_id: branchId,
              p_intervals: payload,
            });

      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data ?? 0;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.scope({ businessId: businessId ?? 'none', branchId }),
      });
      // Staff working hours are one of the branch_is_bookable() requirements.
      void queryClient.invalidateQueries({
        queryKey: branchBookableKeys.business(businessId ?? 'none'),
      });
    },
  });
}

export type TimeOffEntry = {
  id: string;
  staffId: string;
  staffName: string | null;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  reason: string | null;
};

/** Upcoming time off for the business. */
export function useTimeOff(businessId: string | null): UseQueryResult<TimeOffEntry[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: scheduleKeys.list({ businessId: businessId ?? 'none', filters: { upcoming: true } }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.listLong,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('staff_time_off')
        .select(
          'id, staff_id, starts_at, ends_at, is_all_day, reason, staff_profiles(display_name)',
        )
        .eq('business_id', businessId ?? '')
        // Past absences are history; the editor only manages what is to come.
        .gte('ends_at', new Date().toISOString())
        .order('starts_at');
      if (error) throw Object.assign(new Error(error.message), { code: error.code });

      return (data ?? []).map((row) => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_profiles?.display_name ?? null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        isAllDay: row.is_all_day,
        reason: row.reason,
      }));
    },
  });
}

/**
 * How many of this person's future appointments overlap a candidate time-off
 * range. Same imperative, warn-and-proceed use as `getStaffScheduleConflicts`.
 */
export async function getStaffTimeOffConflicts(
  staffId: string,
  startsAt: string,
  endsAt: string,
): Promise<number> {
  const { data, error } = await getSupabase().rpc('staff_time_off_conflicts', {
    p_staff_id: staffId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data ?? 0;
}

/** Books time off. No approval step — see context/schedule.md. */
export function useSaveTimeOff(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    { staffId: string; startsAt: string; endsAt: string; reason: string | null }
  >({
    mutationFn: async ({ staffId, startsAt, endsAt, reason }) => {
      if (!businessId) throw new Error('No business selected');
      const { data, error } = await getSupabase()
        .from('staff_time_off')
        .insert({
          staff_id: staffId,
          business_id: businessId,
          starts_at: startsAt,
          ends_at: endsAt,
          is_all_day: true,
          reason,
        })
        .select('id')
        .single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.business(businessId ?? 'none'),
      });
    },
  });
}

/** Cancels time off. A hard delete: an absence has no history to keep. */
export function useDeleteTimeOff(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<undefined, Error, string>({
    mutationFn: async (id) => {
      const { error } = await getSupabase().from('staff_time_off').delete().eq('id', id);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return undefined;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.business(businessId ?? 'none'),
      });
    },
  });
}
