import {
  addDaysToLocalDate,
  daysInMonth,
  parseLocalDate,
  toLocalDate,
  weekdayOfLocalDate,
  type LocalDate,
} from '@/lib/time';

/**
 * Report periods, mirroring `report_period()` in the database so the screen can
 * label and step a period before any data arrives. The server stays the authority
 * (it returns the exact `from/to/prev_from/prev_to` it used).
 *   weekly  = Monday..Sunday containing the anchor; previous = the week before
 *   monthly = the calendar month containing the anchor; previous = the month before
 *   custom  = from..to inclusive (<= 366 days); previous = the same number of days right before
 */
export type PeriodKind = 'weekly' | 'monthly' | 'custom';

export type PeriodRange = {
  from: LocalDate;
  to: LocalDate;
  prevFrom: LocalDate;
  prevTo: LocalDate;
};

export const MAX_CUSTOM_DAYS = 366;

export function monthBounds(anchor: LocalDate): { from: LocalDate; to: LocalDate } {
  const p = parseLocalDate(anchor);
  if (!p) return { from: anchor, to: anchor };
  return {
    from: toLocalDate(p.year, p.month, 1),
    to: toLocalDate(p.year, p.month, daysInMonth(p.year, p.month)),
  };
}

export function weekBounds(anchor: LocalDate): { from: LocalDate; to: LocalDate } {
  // Monday = start (ISO). getUTCDay: 0 = Sunday.
  const offset = (weekdayOfLocalDate(anchor) + 6) % 7;
  const from = addDaysToLocalDate(anchor, -offset);
  return { from, to: addDaysToLocalDate(from, 6) };
}

/** First day of the month `delta` months from the anchor's month. */
export function shiftMonth(anchor: LocalDate, delta: number): LocalDate {
  const p = parseLocalDate(anchor);
  if (!p) return anchor;
  const index = p.year * 12 + (p.month - 1) + delta;
  return toLocalDate(Math.floor(index / 12), (index % 12) + 1, 1);
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  if (!a || !b) return 0;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

export function resolvePeriod(
  kind: PeriodKind,
  anchor: LocalDate,
  custom?: { from: LocalDate; to: LocalDate },
): PeriodRange | null {
  if (kind === 'weekly') {
    const { from, to } = weekBounds(anchor);
    return {
      from,
      to,
      prevFrom: addDaysToLocalDate(from, -7),
      prevTo: addDaysToLocalDate(from, -1),
    };
  }
  if (kind === 'monthly') {
    const { from, to } = monthBounds(anchor);
    const prev = monthBounds(shiftMonth(anchor, -1));
    return { from, to, prevFrom: prev.from, prevTo: prev.to };
  }
  if (!custom) return null;
  const n = daysBetween(custom.from, custom.to) + 1;
  if (n < 1 || n > MAX_CUSTOM_DAYS) return null;
  return {
    from: custom.from,
    to: custom.to,
    prevFrom: addDaysToLocalDate(custom.from, -n),
    prevTo: addDaysToLocalDate(custom.from, -1),
  };
}

/** Step the anchor one period back (-1) or forward (+1). Custom ranges do not step. */
export function stepAnchor(kind: PeriodKind, anchor: LocalDate, delta: -1 | 1): LocalDate {
  if (kind === 'weekly') return addDaysToLocalDate(anchor, 7 * delta);
  if (kind === 'monthly') return shiftMonth(anchor, delta);
  return anchor;
}
