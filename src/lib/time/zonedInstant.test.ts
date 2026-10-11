import { describe, expect, it } from 'vitest';

import { addMinutesUtc, dayRangeUtc, formatTime, utcToZoned, zonedToUtc } from './index';

/**
 * UTC <-> branch-local instant conversions used by the calendar day/week grid.
 * DST correctness matters here the same way it does for the slot engine
 * (see context/_handoff.md Traps: Postgres resolves an ambiguous fall-back
 * time to the SECOND, standard-time occurrence — `fromZonedTime` must agree).
 */

describe('zonedToUtc / utcToZoned', () => {
  it('round-trips a plain instant', () => {
    const utc = zonedToUtc('2026-06-15', '14:30', 'Europe/London');
    // London is BST (+01:00) in June.
    expect(utc).toBe('2026-06-15T13:30:00.000Z');
    expect(utcToZoned(utc, 'Europe/London')).toEqual({ date: '2026-06-15', time: '14:30' });
  });

  it('resolves an ambiguous DST fall-back time to the second occurrence', () => {
    // London falls back 2027-10-31 02:00 BST -> 01:00 GMT. 01:00 local is
    // ambiguous; Postgres (and here) resolves to the SECOND, GMT occurrence.
    const utc = zonedToUtc('2027-10-31', '01:00', 'Europe/London');
    expect(utc).toBe('2027-10-31T01:00:00.000Z');
  });

  it('handles a spring-forward date correctly', () => {
    // London springs forward 2027-03-28 01:00 GMT -> 02:00 BST.
    const utc = zonedToUtc('2027-03-28', '03:00', 'Europe/London');
    expect(utc).toBe('2027-03-28T02:00:00.000Z');
  });
});

describe('dayRangeUtc', () => {
  it('is a plain 24h range outside DST', () => {
    const { start, end } = dayRangeUtc('2026-01-15', 'Europe/London');
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('is a 23h range on a spring-forward day', () => {
    const { start, end } = dayRangeUtc('2027-03-28', 'Europe/London');
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('is a 25h range on a fall-back day', () => {
    const { start, end } = dayRangeUtc('2027-10-31', 'Europe/London');
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

describe('addMinutesUtc', () => {
  it('adds absolute minutes regardless of zone', () => {
    expect(addMinutesUtc('2026-06-15T13:30:00.000Z' as never, 90)).toBe('2026-06-15T15:00:00.000Z');
  });
});

describe('formatTime', () => {
  it('formats in the given zone, not UTC', () => {
    const instant = '2026-06-15T13:30:00.000Z' as never;
    expect(formatTime(instant, 'Europe/London', 'en-GB')).toMatch(/14:30|2:30/);
    expect(formatTime(instant, 'Asia/Karachi', 'en-GB')).toMatch(/18:30|6:30/);
  });
});
