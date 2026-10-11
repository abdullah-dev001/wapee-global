import { type IanaTimeZone, type MinuteOfDay } from '@/lib/time';

import { minuteOfDayFromTime } from './timeGrid';

export type ShadedInterval = { startMinute: MinuteOfDay; endMinute: MinuteOfDay };

export type StaffDayShading = {
  /** Open intervals for this weekday — outside them is shaded closed. */
  workingIntervals: ShadedInterval[];
  /** Breaks and time off ON this date — shaded closed even inside working hours. */
  closedIntervals: ShadedInterval[];
};

type HourRow = { staff_id: string; start_minute: number; end_minute: number };
type TimeOffRow = {
  staff_id: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  branch_id: string | null;
};

function forStaff(result: Map<string, StaffDayShading>, staffId: string): StaffDayShading {
  let entry = result.get(staffId);
  if (!entry) {
    entry = { workingIntervals: [], closedIntervals: [] };
    result.set(staffId, entry);
  }
  return entry;
}

/**
 * Pure grouping of the three raw queries into per-staff shading, so the
 * instant-range clamping (a time-off row may start the day before or end
 * the day after the viewed date) is unit-testable without a network call.
 * Kept in its own file (no React Query / Supabase imports) so a test can
 * import it without pulling in react-native through the client chain.
 */
export function buildDayShading(
  hours: HourRow[],
  breaks: HourRow[],
  timeOff: TimeOffRow[],
  branchId: string,
  dayRange: { start: string; end: string },
  timeZone: IanaTimeZone,
): Map<string, StaffDayShading> {
  const result = new Map<string, StaffDayShading>();

  for (const row of hours) {
    forStaff(result, row.staff_id).workingIntervals.push({
      startMinute: row.start_minute,
      endMinute: row.end_minute,
    });
  }
  for (const row of breaks) {
    forStaff(result, row.staff_id).closedIntervals.push({
      startMinute: row.start_minute,
      endMinute: row.end_minute,
    });
  }
  for (const row of timeOff) {
    // Away from a SPECIFIC branch, or every branch (branch_id null) — both apply here.
    if (row.branch_id !== null && row.branch_id !== branchId) continue;

    if (row.is_all_day) {
      forStaff(result, row.staff_id).closedIntervals.push({ startMinute: 0, endMinute: 24 * 60 });
      continue;
    }
    // Clamp the instant range to this date's minute-of-day, since the
    // absence may start the day before or end the day after.
    const startMinute =
      row.starts_at <= dayRange.start ? 0 : minuteOfDayFromTime(row.starts_at, timeZone);
    const endMinute =
      row.ends_at >= dayRange.end ? 24 * 60 : minuteOfDayFromTime(row.ends_at, timeZone);
    forStaff(result, row.staff_id).closedIntervals.push({ startMinute, endMinute });
  }

  return result;
}
