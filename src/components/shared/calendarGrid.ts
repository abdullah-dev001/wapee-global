import {
  addDaysToLocalDate,
  daysInMonth,
  parseLocalDate,
  toLocalDate,
  weekdayOfLocalDate,
  type LocalDate,
} from '@/lib/time';

/** Seven columns, six rows: enough for any month in any week alignment. */
export const WEEKS_SHOWN = 6;
export const DAYS_PER_WEEK = 7;

export type DayCell = {
  date: LocalDate;
  dayOfMonth: number;
  /** False for the leading/trailing days that belong to a neighbouring month. */
  inMonth: boolean;
  isToday: boolean;
  isDisabled: boolean;
  isSelected: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isInRange: boolean;
};

export type BuildGridInput = {
  /** First day of the month on screen, "YYYY-MM-DD". */
  visibleMonth: LocalDate;
  /** Today in the BRANCH timezone (decision 23), not the device's. */
  today: LocalDate;
  /** 0 = Sunday .. 6 = Saturday: the weekday the locale starts on. */
  weekStart: number;
  selected?: LocalDate | null;
  rangeEnd?: LocalDate | null;
  minDate?: LocalDate;
  maxDate?: LocalDate;
  disabled?: ReadonlySet<LocalDate>;
};

/**
 * Builds the month grid.
 *
 * Pure and separate from the component so the fiddly parts — week alignment,
 * month lengths, leap years, range membership — can be tested. All comparisons
 * are string comparisons, which is safe because "YYYY-MM-DD" sorts
 * chronologically.
 */
export function buildCalendarGrid({
  visibleMonth,
  today,
  weekStart,
  selected = null,
  rangeEnd = null,
  minDate,
  maxDate,
  disabled,
}: BuildGridInput): DayCell[] {
  const month = parseLocalDate(visibleMonth);
  if (!month) return [];

  const firstOfMonth = toLocalDate(month.year, month.month, 1);

  // Step back from the 1st to the week start so the grid begins on a full week.
  const firstWeekday = weekdayOfLocalDate(firstOfMonth);
  const lead = (firstWeekday - weekStart + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const gridStart = addDaysToLocalDate(firstOfMonth, -lead);

  const cells: DayCell[] = [];
  for (let index = 0; index < WEEKS_SHOWN * DAYS_PER_WEEK; index += 1) {
    const date = addDaysToLocalDate(gridStart, index);
    const parsed = parseLocalDate(date);
    const inMonth = parsed?.month === month.month && parsed?.year === month.year;

    const outsideBounds =
      (minDate !== undefined && date < minDate) || (maxDate !== undefined && date > maxDate);

    cells.push({
      date,
      dayOfMonth: parsed?.day ?? 0,
      inMonth,
      isToday: date === today,
      isDisabled: outsideBounds || (disabled?.has(date) ?? false),
      isSelected: date === selected || (rangeEnd !== null && date === rangeEnd),
      isRangeStart: rangeEnd !== null && date === selected,
      isRangeEnd: rangeEnd !== null && date === rangeEnd,
      isInRange: selected !== null && rangeEnd !== null && date > selected && date < rangeEnd,
    });
  }

  return cells;
}

/** Rows, dropping any trailing week that is entirely outside the month. */
export function gridRows(cells: readonly DayCell[]): DayCell[][] {
  const rows: DayCell[][] = [];
  for (let week = 0; week < WEEKS_SHOWN; week += 1) {
    const row = cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK);
    if (row.length === 0) continue;
    if (row.every((cell) => !cell.inMonth)) continue;
    rows.push(row);
  }
  return rows;
}

/** Month length, for a caller that needs the last day. */
export function lastDayOfMonth(visibleMonth: LocalDate): LocalDate | null {
  const month = parseLocalDate(visibleMonth);
  if (!month) return null;
  return toLocalDate(month.year, month.month, daysInMonth(month.year, month.month));
}

/** Shifts the visible month by `delta` months, keeping the 1st. */
export function shiftMonth(visibleMonth: LocalDate, delta: number): LocalDate {
  const month = parseLocalDate(visibleMonth);
  if (!month) return visibleMonth;
  const index = month.month - 1 + delta;
  const year = month.year + Math.floor(index / 12);
  const monthNumber = (((index % 12) + 12) % 12) + 1;
  return toLocalDate(year, monthNumber, 1);
}

/**
 * The weekday a locale starts its week on, 0 = Sunday.
 *
 * `Intl.Locale.prototype.getWeekInfo` is the proper source but **Hermes has no
 * `Intl.Locale` at all** (context/_handoff.md), so this falls back to Monday,
 * which is the commonest worldwide.
 */
export function localeWeekStart(locale: string): number {
  try {
    const localeInfo = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = localeInfo.getWeekInfo?.() ?? localeInfo.weekInfo;
    // Intl uses 1 = Monday .. 7 = Sunday; ours is 0 = Sunday .. 6 = Saturday.
    if (info) return info.firstDay % 7;
  } catch {
    // Hermes: no Intl.Locale.
  }
  return 1;
}
