import { formatMinuteOfDay } from '@/lib/time';

import { type WebsiteHour } from './types';

export type HoursRow = { dayOfWeek: number; ranges: string[] };

/**
 * One row per weekday that has opening hours, ordered from `firstDay`
 * (0 = Sunday). A weekday with no entry is closed and is returned with an empty
 * `ranges` so the page can print "Closed".
 */
export function hoursRows(hours: readonly WebsiteHour[], firstDay: number): HoursRow[] {
  const rows: HoursRow[] = [];
  for (let i = 0; i < 7; i++) {
    const day = (firstDay + i) % 7;
    const ranges = hours
      .filter((h) => h.dayOfWeek === day)
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((h) => `${formatMinuteOfDay(h.startMinute)}–${formatMinuteOfDay(h.endMinute)}`);
    rows.push({ dayOfWeek: day, ranges });
  }
  return rows;
}
