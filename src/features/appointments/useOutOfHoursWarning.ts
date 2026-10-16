import { useBranchSchedule } from '@/features/schedule/api/useBranchSchedule';
import { useStaffSchedule } from '@/features/schedule/api/useSchedule';
import { weekdayOfLocalDate } from '@/lib/time';

/**
 * Warns when the chosen slot falls outside the staff member's recurring
 * working hours for that weekday, OR outside the branch's hours when no
 * staff is picked yet. Doc §6.2: staff can still book or move it there — this
 * is advisory only, never a block, and the RPCs enforce nothing based on it.
 *
 * Shared by the create form and the reschedule form.
 */
export function useOutOfHoursWarning(
  businessId: string | null,
  branchId: string | null,
  staffId: string | null,
  date: string,
  minute: number,
): boolean {
  const branchSchedule = useBranchSchedule(businessId, branchId);
  const staffSchedule = useStaffSchedule(businessId, branchId, staffId);

  if (!date) return false;
  const dayOfWeek = weekdayOfLocalDate(date);

  const intervals = staffId ? staffSchedule.data?.workingHours : branchSchedule.data?.hours;
  if (!intervals) return false;

  const withinHours = intervals.some(
    (interval) =>
      interval.dayOfWeek === dayOfWeek &&
      minute >= interval.startMinute &&
      minute < interval.endMinute,
  );
  return !withinHours;
}
