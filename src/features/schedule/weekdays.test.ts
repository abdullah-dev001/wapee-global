import { describe, expect, it } from 'vitest';

import { DAYS_OF_WEEK, orderedWeekdays, weekdayNames } from './weekdays';

/**
 * Weekday mapping. `day_of_week` is 0 = Sunday .. 6 = Saturday (Postgres `dow`,
 * JS `getDay`); getting this off by one would silently move everybody's shifts
 * to the wrong day.
 */
describe('weekdayNames', () => {
  it('maps 0 to Sunday and 6 to Saturday', () => {
    const names = weekdayNames('en-GB');
    expect(names[0]).toBe('Sunday');
    expect(names[1]).toBe('Monday');
    expect(names[6]).toBe('Saturday');
  });

  it('returns all seven, in order', () => {
    expect(weekdayNames('en-GB')).toHaveLength(7);
    expect(weekdayNames('en-GB', 'short')).toHaveLength(7);
  });

  it('is localised', () => {
    // Not asserting exact strings — only that another language differs.
    expect(weekdayNames('de-DE')[1]).toBe('Montag');
    expect(weekdayNames('fr-FR')[1]).toBe('lundi');
  });

  it('is not shifted by the device timezone', () => {
    // The reference dates are UTC midnights. A local-time formatter on a
    // negative-offset device would render each as the previous day.
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(weekdayNames('en-GB')[0]).toBe('Sunday');
      process.env.TZ = 'Pacific/Kiritimati';
      expect(weekdayNames('en-GB')[0]).toBe('Sunday');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('orderedWeekdays', () => {
  it('covers every weekday exactly once', () => {
    const ordered = orderedWeekdays('en-GB');
    expect(ordered).toHaveLength(7);
    expect([...ordered].sort()).toEqual([...DAYS_OF_WEEK]);
  });

  it('starts the week on one day and wraps around', () => {
    const ordered = orderedWeekdays('en-GB');
    const first = ordered[0] ?? 0;
    expect(ordered[6]).toBe((first + 6) % 7);
  });
});
