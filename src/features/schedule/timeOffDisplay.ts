/**
 * The days a time-off entry covers, as the owner should read them (QA F17).
 *
 * A whole-day entry is stored as [local midnight of the first day, local
 * midnight after the last day) in UTC. Showing those instants in UTC (and
 * subtracting a whole day from the end) put the list one day early for any
 * branch ahead of UTC, e.g. "Oct 22" for a day off on 23 Oct in London (BST).
 *
 * The first day is the start instant read in the BRANCH zone; the last day is
 * the instant just before the exclusive end, read in the branch zone (safe on
 * DST days, unlike "minus 24 hours").
 */
export function timeOffDisplayRange(
  startsAt: string,
  endsAt: string,
): { firstInstant: Date; lastInstant: Date } {
  const first = new Date(startsAt);
  const end = new Date(endsAt);
  const last = new Date(Math.max(first.getTime(), end.getTime() - 1));
  return { firstInstant: first, lastInstant: last };
}

/** "Oct 23, 2026"-style label of a day, read in the branch time zone. */
export function formatBranchDay(instant: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(instant);
}
