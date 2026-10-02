import { describe, expect, it } from 'vitest';

import {
  addDaysToLocalDate,
  dateInZone,
  daysInMonth,
  parseLocalDate,
  todayInZone,
  toLocalDate,
  weekdayOfLocalDate,
} from './index';

/**
 * Calendar-date helpers for the month grid.
 *
 * "Today" comes from the BRANCH timezone (decision 23), and calendar arithmetic
 * must be immune to DST — a bug here puts the wrong day in the grid, or lets a
 * customer book yesterday.
 */

describe('dateInZone / todayInZone', () => {
  it('uses the zone, not the device', () => {
    // 2026-06-15 23:30 UTC is already the 16th in Karachi (+05:00) and still
    // the 15th in London (+01:00 in June).
    const instant = new Date('2026-06-15T23:30:00.000Z');
    expect(dateInZone(instant, 'Asia/Karachi')).toBe('2026-06-16');
    expect(dateInZone(instant, 'Europe/London')).toBe('2026-06-16');
    expect(dateInZone(instant, 'America/Los_Angeles')).toBe('2026-06-15');
  });

  it('is correct across the date line', () => {
    const instant = new Date('2026-06-15T11:00:00.000Z');
    // Kiritimati is +14, Honolulu is -10: a whole day apart.
    expect(dateInZone(instant, 'Pacific/Kiritimati')).toBe('2026-06-16');
    expect(dateInZone(instant, 'Pacific/Honolulu')).toBe('2026-06-15');
  });

  it('handles a DST transition day', () => {
    // London springs forward 2026-03-29 at 01:00 UTC.
    const before = new Date('2026-03-29T00:30:00.000Z');
    const after = new Date('2026-03-29T01:30:00.000Z');
    expect(dateInZone(before, 'Europe/London')).toBe('2026-03-29');
    expect(dateInZone(after, 'Europe/London')).toBe('2026-03-29');
  });

  it('zero-pads so the string sorts correctly', () => {
    expect(dateInZone(new Date('2026-01-05T12:00:00.000Z'), 'UTC')).toBe('2026-01-05');
  });

  it('todayInZone takes an injectable now', () => {
    const now = new Date('2026-12-25T18:00:00.000Z');
    expect(todayInZone('UTC', now)).toBe('2026-12-25');
    // Already Boxing Day in Auckland (+13).
    expect(todayInZone('Pacific/Auckland', now)).toBe('2026-12-26');
  });
});

describe('parseLocalDate', () => {
  it('accepts a real date', () => {
    expect(parseLocalDate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('accepts 29 February in a leap year and rejects it otherwise', () => {
    expect(parseLocalDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseLocalDate('2026-02-29')).toBeNull();
  });

  it('rejects impossible dates rather than rolling them over', () => {
    // A naive Date would turn these into March and January.
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '2026-1-1',
      '',
      'today',
    ]) {
      expect(parseLocalDate(bad), bad).toBeNull();
    }
  });
});

describe('addDaysToLocalDate', () => {
  it('crosses month and year boundaries', () => {
    expect(addDaysToLocalDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToLocalDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToLocalDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles leap years', () => {
    expect(addDaysToLocalDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToLocalDate('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('is unaffected by DST', () => {
    // Around the UK spring-forward; pure calendar maths must still be +1 day.
    expect(addDaysToLocalDate('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysToLocalDate('2026-03-29', 1)).toBe('2026-03-30');
    // And the autumn fall-back.
    expect(addDaysToLocalDate('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDaysToLocalDate('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('adds nothing for 0 and returns the input unchanged if malformed', () => {
    expect(addDaysToLocalDate('2026-05-05', 0)).toBe('2026-05-05');
    expect(addDaysToLocalDate('nonsense', 1)).toBe('nonsense');
  });
});

describe('daysInMonth', () => {
  it('knows the month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('knows leap years, including the century rules', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });
});

describe('weekdayOfLocalDate', () => {
  it('returns 0 for Sunday, matching the schedule tables', () => {
    expect(weekdayOfLocalDate('2026-11-01')).toBe(0);
    expect(weekdayOfLocalDate('2026-11-02')).toBe(1);
    expect(weekdayOfLocalDate('2026-11-07')).toBe(6);
  });
});

describe('toLocalDate', () => {
  it('pads every part', () => {
    expect(toLocalDate(2026, 1, 2)).toBe('2026-01-02');
    expect(toLocalDate(999, 12, 31)).toBe('0999-12-31');
  });
});
