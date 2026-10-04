import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { dayRangeUtc, type IanaTimeZone, type LocalDate } from '@/lib/time';

import { buildDayShading, type StaffDayShading } from '../dayShading';

export type { ShadedInterval, StaffDayShading } from '../dayShading';

/**
 * Per-staff shading for the Day/Week grid: working hours for the viewed
 * weekday, plus breaks and time off that fall on the viewed date — one
 * round trip for every staff member at the branch, so `DayView` does not
 * need a query per staff column (which Rules of Hooks would forbid inside
 * a `.map()` anyway).
 *
 * `staff_working_hours`/`staff_breaks` are recurring (`day_of_week` +
 * minute-of-day, same tables `useStaffSchedule` reads one staff at a time
 * for the schedule editor — context/schedule.md). `staff_time_off` is a UTC
 * instant range, intersected with the viewed date's UTC range (branch
 * timezone) and converted to minute-of-day. The grouping itself is the
 * pure, tested `buildDayShading` (`../dayShading.ts`).
 */
export function useDayShading(
  businessId: string | null,
  branchId: string | null,
  date: LocalDate,
  timeZone: IanaTimeZone,
): UseQueryResult<Map<string, StaffDayShading>, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: ['appointments', 'day-shading', businessId ?? 'none', branchId ?? 'none', date],
    enabled: isAuthenticated && Boolean(businessId && branchId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const supabase = getSupabase();
      const dayOfWeek = new Date(dayRangeUtc(date, timeZone).start).getUTCDay();
      const { start, end } = dayRangeUtc(date, timeZone);

      const [hours, breaks, timeOff] = await Promise.all([
        supabase
          .from('staff_working_hours')
          .select('staff_id, start_minute, end_minute')
          .eq('branch_id', branchId ?? '')
          .eq('day_of_week', dayOfWeek),
        supabase
          .from('staff_breaks')
          .select('staff_id, start_minute, end_minute')
          .eq('branch_id', branchId ?? '')
          .eq('day_of_week', dayOfWeek),
        supabase
          .from('staff_time_off')
          .select('staff_id, starts_at, ends_at, is_all_day, branch_id')
          .eq('business_id', businessId ?? '')
          .lt('starts_at', end)
          .gt('ends_at', start),
      ]);

      if (hours.error) throw new Error(hours.error.message);
      if (breaks.error) throw new Error(breaks.error.message);
      if (timeOff.error) throw new Error(timeOff.error.message);

      return buildDayShading(
        hours.data ?? [],
        breaks.data ?? [],
        timeOff.data ?? [],
        branchId ?? '',
        { start, end },
        timeZone,
      );
    },
  });
}
