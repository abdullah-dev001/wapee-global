import { describe, expect, it } from 'vitest';

import {
  DAYS_PER_WEEK,
  WEEKS_SHOWN,
  buildCalendarGrid,
  gridRows,
  lastDayOfMonth,
  localeWeekStart,
  shiftMonth,
} from './calendarGrid';

/**
 * The month grid. Week alignment, month lengths and range membership are the
 * parts that silently show the wrong day, so they are tested rather than eyeballed.
 */

const base = { today: '2026-06-15', weekStart: 1 as number };

describe('buildCalendarGrid', () => {
  it('always returns a full 6x7 grid', () => {
    const cells = buildCalendarGrid({ ...base, visibleMonth: '2026-06-01' });
    expect(cells).toHaveLength(WEEKS_SHOWN * DAYS_PER_WEEK);
  });

  it('starts on the locale week start', () => {
    // June 2026 starts on a Monday, so a Monday-start grid begins exactly on the 1st.
    const monday = buildCalendarGrid({ ...base, visibleMonth: '2026-06-01', weekStart: 1 });
    expect(monday[0]?.date).toBe('2026-06-01');
    expect(monday[0]?.inMonth).toBe(true);

    // A Sunday-start grid must lead with 31 May.
    const sunday = buildCalendarGrid({ ...base, visibleMonth: '2026-06-01', weekStart: 0 });
    expect(sunday[0]?.date).toBe('2026-05-31');
    expect(sunday[0]?.inMonth).toBe(false);
  });

  it('marks leading and trailing days as outside the month', () => {
    const cells = buildCalendarGrid({ ...base, visibleMonth: '2026-06-01', weekStart: 0 });
    const inMonth = cells.filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0]?.date).toBe('2026-06-01');
    expect(inMonth[29]?.date).toBe('2026-06-30');
  });

  it('handles a 31-day month and February', () => {
    expect(
      buildCalendarGrid({ ...base, visibleMonth: '2026-07-01' }).filter((c) => c.inMonth),
    ).toHaveLength(31);
    expect(
      buildCalendarGrid({ ...base, visibleMonth: '2026-02-01' }).filter((c) => c.inMonth),
    ).toHaveLength(28);
  });

  it('handles a leap February', () => {
    const cells = buildCalendarGrid({ ...base, visibleMonth: '2028-02-01' }).filter(
      (c) => c.inMonth,
    );
    expect(cells).toHaveLength(29);
    expect(cells[28]?.date).toBe('2028-02-29');
  });

  it('marks today, using the date it is given', () => {
    const cells = buildCalendarGrid({ ...base, visibleMonth: '2026-06-01' });
    const todays = cells.filter((cell) => cell.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]?.date).toBe('2026-06-15');
  });

  it('disables days outside min and max', () => {
    const cells = buildCalendarGrid({
      ...base,
      visibleMonth: '2026-06-01',
      minDate: '2026-06-10',
      maxDate: '2026-06-20',
    });
    const find = (date: string) => cells.find((cell) => cell.date === date);
    expect(find('2026-06-09')?.isDisabled).toBe(true);
    expect(find('2026-06-10')?.isDisabled).toBe(false);
    expect(find('2026-06-20')?.isDisabled).toBe(false);
    expect(find('2026-06-21')?.isDisabled).toBe(true);
  });

  it('disables explicitly listed days (a closed or full day)', () => {
    const cells = buildCalendarGrid({
      ...base,
      visibleMonth: '2026-06-01',
      disabled: new Set(['2026-06-17']),
    });
    expect(cells.find((cell) => cell.date === '2026-06-17')?.isDisabled).toBe(true);
    expect(cells.find((cell) => cell.date === '2026-06-18')?.isDisabled).toBe(false);
  });

  it('marks a range: both ends selected, the middle in range', () => {
    const cells = buildCalendarGrid({
      ...base,
      visibleMonth: '2026-06-01',
      selected: '2026-06-10',
      rangeEnd: '2026-06-13',
    });
    const find = (date: string) => cells.find((cell) => cell.date === date);

    expect(find('2026-06-10')?.isRangeStart).toBe(true);
    expect(find('2026-06-13')?.isRangeEnd).toBe(true);
    expect(find('2026-06-10')?.isSelected).toBe(true);
    expect(find('2026-06-13')?.isSelected).toBe(true);
    // Strictly between, so the ends are not double-counted.
    expect(find('2026-06-11')?.isInRange).toBe(true);
    expect(find('2026-06-12')?.isInRange).toBe(true);
    expect(find('2026-06-10')?.isInRange).toBe(false);
    expect(find('2026-06-13')?.isInRange).toBe(false);
    expect(find('2026-06-14')?.isInRange).toBe(false);
  });

  it('marks a single selected day with no range', () => {
    const cells = buildCalendarGrid({
      ...base,
      visibleMonth: '2026-06-01',
      selected: '2026-06-10',
    });
    const cell = cells.find((entry) => entry.date === '2026-06-10');
    expect(cell?.isSelected).toBe(true);
    // Without a rangeEnd nothing is a range end point.
    expect(cell?.isRangeStart).toBe(false);
    expect(cells.some((entry) => entry.isInRange)).toBe(false);
  });

  it('returns nothing for a malformed month', () => {
    expect(buildCalendarGrid({ ...base, visibleMonth: 'nope' })).toEqual([]);
  });
});

describe('gridRows', () => {
  it('drops a trailing week that is entirely outside the month', () => {
    // Feb 2026 starts on a Sunday and has 28 days: exactly 4 weeks on a
    // Sunday-start grid, so rows 5 and 6 are all next month.
    const rows = gridRows(buildCalendarGrid({ ...base, visibleMonth: '2026-02-01', weekStart: 0 }));
    expect(rows).toHaveLength(4);
  });

  it('keeps every week that contains a day of the month', () => {
    const rows = gridRows(buildCalendarGrid({ ...base, visibleMonth: '2026-08-01', weekStart: 1 }));
    const inMonth = rows.flat().filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(rows.every((row) => row.length === DAYS_PER_WEEK)).toBe(true);
  });
});

describe('shiftMonth', () => {
  it('moves forward and back, always landing on the 1st', () => {
    expect(shiftMonth('2026-06-15', 1)).toBe('2026-07-01');
    expect(shiftMonth('2026-06-01', -1)).toBe('2026-05-01');
  });

  it('crosses year boundaries in both directions', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-01-01', -13)).toBe('2024-12-01');
    expect(shiftMonth('2026-06-01', 18)).toBe('2027-12-01');
  });
});

describe('lastDayOfMonth', () => {
  it('knows the month lengths including leap February', () => {
    expect(lastDayOfMonth('2026-06-10')).toBe('2026-06-30');
    expect(lastDayOfMonth('2026-02-01')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02-01')).toBe('2028-02-29');
  });
});

describe('localeWeekStart', () => {
  it('returns a weekday in range', () => {
    for (const locale of ['en-GB', 'en-US', 'ar-EG', 'de-DE']) {
      const start = localeWeekStart(locale);
      expect(start, locale).toBeGreaterThanOrEqual(0);
      expect(start, locale).toBeLessThanOrEqual(6);
    }
  });

  it('falls back rather than throwing on a nonsense locale', () => {
    expect(() => localeWeekStart('not-a-locale!!')).not.toThrow();
  });
});
