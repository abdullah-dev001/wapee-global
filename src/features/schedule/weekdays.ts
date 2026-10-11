/**
 * Weekday helpers for the schedule editor.
 *
 * `day_of_week` is 0 = Sunday .. 6 = Saturday, matching Postgres `extract(dow)`
 * and JS `Date.getDay()` (see context/schedule.md).
 */

export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/**
 * Weekday names in the given locale, from `Intl` rather than a hard-coded list,
 * so every language gets its own names with no translation work.
 */
export function weekdayNames(locale: string, format: 'long' | 'short' = 'long'): string[] {
  try {
    // timeZone UTC matters: the reference dates below are UTC midnights, and on
    // a device west of Greenwich a local-time formatter would render each one as
    // the PREVIOUS day, shifting every weekday name by one.
    const formatter = new Intl.DateTimeFormat(locale, { weekday: format, timeZone: 'UTC' });
    // 2026-11-01 was a Sunday, so adding the index lands on each weekday in turn
    // and keeps the 0 = Sunday ordering.
    return DAYS_OF_WEEK.map((day) => formatter.format(new Date(Date.UTC(2026, 10, 1 + day))));
  } catch {
    // Intl should always be present, but never break a screen over a name.
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  }
}

/**
 * The weekday a locale starts its week on, so the editor reads naturally:
 * Sunday in the US and much of the Middle East, Monday across Europe.
 *
 * `Intl.Locale.prototype.getWeekInfo` is the proper source but **does not exist
 * in Hermes** (context/_handoff.md records that `Intl.Locale` is missing on
 * device), so this falls back to Monday, which is the commonest.
 */
export function firstDayOfWeek(locale: string): DayOfWeek {
  try {
    const localeWithInfo = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = localeWithInfo.getWeekInfo?.() ?? localeWithInfo.weekInfo;
    if (info) {
      // Intl uses 1 = Monday .. 7 = Sunday; ours is 0 = Sunday .. 6 = Saturday.
      return (info.firstDay % 7) as DayOfWeek;
    }
  } catch {
    // Hermes: no Intl.Locale at all.
  }
  return 1;
}

/** Weekdays in display order for the locale, e.g. Mon..Sun or Sun..Sat. */
export function orderedWeekdays(locale: string): DayOfWeek[] {
  const first = firstDayOfWeek(locale);
  return DAYS_OF_WEEK.map((offset) => ((first + offset) % 7) as DayOfWeek);
}
