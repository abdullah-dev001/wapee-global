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
import { notImplemented } from '@/lib/notImplemented';

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

/** Current instant as a UTC ISO string. */
export function nowUtc(): UtcIso {
  return notImplemented('nowUtc');
}

/**
 * Device timezone (IANA). Used only to pre-fill a form before the BRANCH
 * timezone is known. Never use it for slot maths, reminders or "today":
 * those always take the branch timezone (product doc decision 23).
 */
export function getDeviceTimeZone(): IanaTimeZone {
  return notImplemented('getDeviceTimeZone');
}

/** True when `zone` is a valid IANA timezone name. */
export function isValidTimeZone(_zone: string): boolean {
  return notImplemented('isValidTimeZone');
}

/**
 * Converts a wall-clock date + time in `zone` to a UTC instant. DST-safe:
 * non-existent times (spring forward) and ambiguous times (fall back) must follow
 * one documented rule.
 */
export function zonedToUtc(_date: LocalDate, _time: LocalTime, _zone: IanaTimeZone): UtcIso {
  return notImplemented('zonedToUtc');
}

/** Splits a UTC instant into the wall-clock date and time seen in `zone`. */
export function utcToZoned(
  _instant: UtcIso,
  _zone: IanaTimeZone,
): { date: LocalDate; time: LocalTime } {
  return notImplemented('utcToZoned');
}

/** UTC start and end (exclusive) of a calendar day in `zone` (23/25h on DST days). */
export function dayRangeUtc(_date: LocalDate, _zone: IanaTimeZone): { start: UtcIso; end: UtcIso } {
  return notImplemented('dayRangeUtc');
}

/** "Today" as a calendar date in `zone`. */
export function todayInZone(_zone: IanaTimeZone): LocalDate {
  return notImplemented('todayInZone');
}

/** Adds minutes to a UTC instant (absolute time, not wall-clock). */
export function addMinutesUtc(_instant: UtcIso, _minutes: number): UtcIso {
  return notImplemented('addMinutesUtc');
}

/** Formats a UTC instant as a date in `zone` with the business locale (Intl). */
export function formatDate(
  _instant: UtcIso,
  _zone: IanaTimeZone,
  _locale: LocaleTag,
  _style?: DateFormatStyle,
): string {
  return notImplemented('formatDate');
}

/** Formats a UTC instant as a time in `zone` (12h/24h follows the locale). */
export function formatTime(_instant: UtcIso, _zone: IanaTimeZone, _locale: LocaleTag): string {
  return notImplemented('formatTime');
}

/** Formats a UTC instant as date + time in `zone`. */
export function formatDateTime(
  _instant: UtcIso,
  _zone: IanaTimeZone,
  _locale: LocaleTag,
  _style?: DateFormatStyle,
): string {
  return notImplemented('formatDateTime');
}

/** Formats a duration in minutes for display, e.g. "1 h 30 min" (locale-aware). */
export function formatDuration(_minutes: number, _locale: LocaleTag): string {
  return notImplemented('formatDuration');
}

/** Relative time such as "in 2 hours" / "3 days ago" (Intl.RelativeTimeFormat). */
export function formatRelative(_instant: UtcIso, _locale: LocaleTag, _now?: UtcIso): string {
  return notImplemented('formatRelative');
}
