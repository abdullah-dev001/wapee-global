/**
 * ALL timezone and date helpers live here (CLAUDE.md §6, §8). Nothing else in the
 * app may do timezone math. Built on date-fns + date-fns-tz.
 *
 * Rules:
 * - The DB stores `timestamptz` in UTC; the app passes ISO strings (`UtcIso`).
 * - The **branch** owns the timezone (IANA, e.g. "Asia/Karachi"). A business can
 *   have branches in different countries, so there is no single business zone.
 * - Wall-clock values (what a person sees on a clock in that zone) are `LocalDate` / `LocalTime`.
 * - Display formatting uses the business locale via Intl.
 *
 * SKELETON: signatures only. Implement each helper in the task that first needs it.
 */
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import * as Localization from 'expo-localization';

/** ISO-8601 timestamp in UTC, e.g. "2026-10-01T09:30:00.000Z". */
export type UtcIso = string & { readonly __brand: 'UtcIso' };
/** IANA timezone name, e.g. "Europe/London". */
export type IanaTimeZone = string;
/** BCP-47 locale tag, e.g. "en-GB". */
export type LocaleTag = string;
/** Calendar date without time or zone, "YYYY-MM-DD". */
export type LocalDate = string;
/** Wall-clock time without date or zone, "HH:mm". */
export type LocalTime = string;

export type DateFormatStyle = 'short' | 'medium' | 'long' | 'full';

/**
 * Minutes from local midnight, 0–1440. The schedule tables store recurring hours
 * this way rather than as `time`, because Postgres has no range type over `time`
 * and the no-overlap exclusion constraints need one (see the Phase 2 migration).
 * 540 = 09:00, 1440 = end of day.
 */
export type MinuteOfDay = number;

/** Minutes in a day. `end_minute` may equal this; `start_minute` may not. */
export const MINUTES_PER_DAY = 1440;

/**
 * "HH:MM" (24h) for a minute offset. Always zero-padded, so it sorts and compares
 * as a string and round-trips through `parseMinuteOfDay`.
 *
 * This is a DATA format, not a display format: it is what `<input type="time">`
 * and the schedule rows use. Use `formatTime` for something a customer reads.
 */
export function formatMinuteOfDay(minutes: MinuteOfDay): LocalTime {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Parses "HH:MM" (or "H:MM") into minutes from midnight. Returns null for
 * anything that is not a real time, so a caller must handle bad input rather
 * than silently getting 0.
 */
export function parseMinuteOfDay(value: string): MinuteOfDay | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(mins)) return null;
  if (hours > 24 || mins > 59) return null;
  const total = hours * 60 + mins;
  if (total > MINUTES_PER_DAY) return null;
  return total;
}

/** Current instant as a UTC ISO string. */
export function nowUtc(): UtcIso {
  return new Date().toISOString() as UtcIso;
}

/**
 * Device timezone (IANA). Used only to pre-fill a form before the BRANCH
 * timezone is known. Never use it for slot maths, reminders or "today":
 * those always take the branch timezone (product doc decision 23).
 */
export function getDeviceTimeZone(): IanaTimeZone {
  return Localization.getCalendars()[0]?.timeZone ?? 'UTC';
}

/** True when `zone` is a valid IANA timezone name. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a wall-clock date + time in `zone` to a UTC instant. DST-safe via
 * `fromZonedTime` (date-fns-tz): a non-existent time (spring forward) is
 * pushed forward by the gap; an ambiguous time (fall back) resolves to the
 * SECOND, standard-time occurrence — matching Postgres's own resolution
 * (see `context/_handoff.md` Traps). Do not change this without re-checking
 * that trap.
 */
export function zonedToUtc(date: LocalDate, time: LocalTime, zone: IanaTimeZone): UtcIso {
  return fromZonedTime(`${date}T${time}:00`, zone).toISOString() as UtcIso;
}

/** Splits a UTC instant into the wall-clock date and time seen in `zone`. */
export function utcToZoned(
  instant: UtcIso,
  zone: IanaTimeZone,
): { date: LocalDate; time: LocalTime } {
  const zoned = toZonedTime(instant, zone);
  const date = dateInZone(new Date(instant), zone);
  const time = `${String(zoned.getHours()).padStart(2, '0')}:${String(zoned.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

/** UTC start and end (exclusive) of a calendar day in `zone` (23/25h on DST days). */
export function dayRangeUtc(date: LocalDate, zone: IanaTimeZone): { start: UtcIso; end: UtcIso } {
  const start = zonedToUtc(date, '00:00', zone);
  const end = zonedToUtc(addDaysToLocalDate(date, 1), '00:00', zone);
  return { start, end };
}

/**
 * "Today" as a calendar date in `zone`.
 *
 * Built from `Intl` parts rather than from a UTC offset, so it is correct across
 * the date line and on DST days. The branch timezone decides what "today" means
 * (product doc decision 23) — never the device.
 */
export function todayInZone(zone: IanaTimeZone, now: Date = new Date()): LocalDate {
  return dateInZone(now, zone);
}

/** The calendar date an instant falls on, as seen in `zone`. */
export function dateInZone(instant: Date, zone: IanaTimeZone): LocalDate {
  // `en-CA` formats as YYYY-MM-DD, but the parts are read explicitly so the
  // result cannot depend on a locale's ordering.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Splits "YYYY-MM-DD" into numbers. Returns null if it is not a real date. */
export function parseLocalDate(
  value: LocalDate,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Rejects 2026-02-30, which would otherwise roll into March.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Builds "YYYY-MM-DD" from parts, zero-padded. */
export function toLocalDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Adds whole days to a calendar date.
 *
 * Pure calendar arithmetic through UTC, with no timezone involved: adding a day
 * to a date must never be affected by DST, because "the 26th" is the 26th
 * whatever the clocks did.
 */
export function addDaysToLocalDate(value: LocalDate, days: number): LocalDate {
  const parsed = parseLocalDate(value);
  if (!parsed) return value;
  const probe = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  probe.setUTCDate(probe.getUTCDate() + days);
  return toLocalDate(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate());
}

/** Days in a month. `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday of a calendar date, 0 = Sunday .. 6 = Saturday. */
export function weekdayOfLocalDate(value: LocalDate): number {
  const parsed = parseLocalDate(value);
  if (!parsed) return 0;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

/** Adds minutes to a UTC instant (absolute time, not wall-clock). */
export function addMinutesUtc(instant: UtcIso, minutes: number): UtcIso {
  return new Date(new Date(instant).getTime() + minutes * 60_000).toISOString() as UtcIso;
}

const DATE_STYLE_OPTIONS: Record<DateFormatStyle, Intl.DateTimeFormatOptions> = {
  short: { month: 'numeric', day: 'numeric', year: '2-digit' },
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  long: { month: 'long', day: 'numeric', year: 'numeric' },
  full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
};

/** Formats a UTC instant as a date in `zone` with the business locale (Intl). */
export function formatDate(
  instant: UtcIso,
  zone: IanaTimeZone,
  locale: LocaleTag,
  style: DateFormatStyle = 'medium',
): string {
  return new Intl.DateTimeFormat(locale, {
    ...DATE_STYLE_OPTIONS[style],
    timeZone: zone,
  }).format(new Date(instant));
}

/** Formats a UTC instant as a time in `zone` (12h/24h follows the locale). */
export function formatTime(instant: UtcIso, zone: IanaTimeZone, locale: LocaleTag): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  }).format(new Date(instant));
}

/** Formats a UTC instant as date + time in `zone`. */
export function formatDateTime(
  instant: UtcIso,
  zone: IanaTimeZone,
  locale: LocaleTag,
  style: DateFormatStyle = 'medium',
): string {
  return new Intl.DateTimeFormat(locale, {
    ...DATE_STYLE_OPTIONS[style],
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  }).format(new Date(instant));
}

/**
 * Guards `Intl.NumberFormat` unit output. Hermes on iOS was seen formatting 30
 * minutes as "1,800s" (it converted to seconds), which is wrong, not merely
 * unlocalised. A correct unit string always still contains the number we passed
 * in, so anything that does not is replaced by the plain fallback.
 */
export function sensibleUnitText(
  formatted: string,
  value: number,
  fallback: string,
  locale: LocaleTag = 'en',
): string {
  let plain: string;
  try {
    // The number in the locale's own numerals ("٣٠" in Arabic), without separators.
    plain = new Intl.NumberFormat(locale, { useGrouping: false }).format(value);
  } catch {
    plain = String(value);
  }
  return formatted.includes(plain) && !/\d\s*s$/i.test(formatted) ? formatted : fallback;
}

/**
 * Formats a duration in minutes for display, e.g. "1 h 30 min".
 *
 * `Intl.DurationFormat` is not in Hermes (and is new even in browsers), so this
 * builds the string from `Intl.NumberFormat` units, which are widely supported.
 * Falls back to a plain "90 min" if the runtime lacks the unit style.
 */
export function formatDuration(minutes: number, locale: LocaleTag): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  const unit = (value: number, which: 'hour' | 'minute') => {
    const fallback = `${value} ${which === 'hour' ? 'h' : 'min'}`;
    try {
      const formatted = new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: which,
        unitDisplay: 'short',
      }).format(value);
      return sensibleUnitText(formatted, value, fallback, locale);
    } catch {
      // Older runtime with no unit style: good enough, and never throws.
      return fallback;
    }
  };

  if (hours === 0) return unit(mins, 'minute');
  if (mins === 0) return unit(hours, 'hour');
  return `${unit(hours, 'hour')} ${unit(mins, 'minute')}`;
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];

/** Relative time such as "in 2 hours" / "3 days ago" (Intl.RelativeTimeFormat). */
export function formatRelative(instant: UtcIso, locale: LocaleTag, now?: UtcIso): string {
  const diffMs = new Date(instant).getTime() - new Date(now ?? nowUtc()).getTime();
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const { unit, ms } of RELATIVE_UNITS) {
    const value = diffMs / ms;
    if (Math.abs(value) >= 1) {
      return formatter.format(Math.round(value), unit);
    }
  }
  return formatter.format(Math.round(diffMs / 1000), 'second');
}
