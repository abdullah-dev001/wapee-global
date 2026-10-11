import { describe, expect, it } from 'vitest';

import { buildDayShading } from './dayShading';

const DAY_RANGE = { start: '2026-06-15T00:00:00.000Z', end: '2026-06-16T00:00:00.000Z' };
const ZONE = 'UTC';

describe('buildDayShading', () => {
  it('groups working hours per staff', () => {
    const result = buildDayShading(
      [
        { staff_id: 'a', start_minute: 540, end_minute: 1020 },
        { staff_id: 'b', start_minute: 600, end_minute: 1080 },
      ],
      [],
      [],
      'branch-1',
      DAY_RANGE,
      ZONE,
    );
    expect(result.get('a')?.workingIntervals).toEqual([{ startMinute: 540, endMinute: 1020 }]);
    expect(result.get('b')?.workingIntervals).toEqual([{ startMinute: 600, endMinute: 1080 }]);
  });

  it('groups breaks as closed intervals', () => {
    const result = buildDayShading(
      [],
      [{ staff_id: 'a', start_minute: 720, end_minute: 750 }],
      [],
      'branch-1',
      DAY_RANGE,
      ZONE,
    );
    expect(result.get('a')?.closedIntervals).toEqual([{ startMinute: 720, endMinute: 750 }]);
  });

  it('an all-day time-off closes the whole day', () => {
    const result = buildDayShading(
      [],
      [],
      [
        {
          staff_id: 'a',
          starts_at: '2026-06-15T00:00:00.000Z',
          ends_at: '2026-06-16T00:00:00.000Z',
          is_all_day: true,
          branch_id: null,
        },
      ],
      'branch-1',
      DAY_RANGE,
      ZONE,
    );
    expect(result.get('a')?.closedIntervals).toEqual([{ startMinute: 0, endMinute: 24 * 60 }]);
  });

  it('a partial-day time-off clamps to minute-of-day', () => {
    const result = buildDayShading(
      [],
      [],
      [
        {
          staff_id: 'a',
          starts_at: '2026-06-15T13:00:00.000Z',
          ends_at: '2026-06-15T15:00:00.000Z',
          is_all_day: false,
          branch_id: null,
        },
      ],
      'branch-1',
      DAY_RANGE,
      ZONE,
    );
    expect(result.get('a')?.closedIntervals).toEqual([
      { startMinute: 13 * 60, endMinute: 15 * 60 },
    ]);
  });

  it('a time-off starting before the viewed day clamps its start to 0', () => {
    const result = buildDayShading(
      [],
      [],
      [
        {
          staff_id: 'a',
          starts_at: '2026-06-14T10:00:00.000Z',
          ends_at: '2026-06-15T10:00:00.000Z',
          is_all_day: false,
          branch_id: null,
        },
      ],
      'branch-1',
      DAY_RANGE,
      ZONE,
    );
    expect(result.get('a')?.closedIntervals).toEqual([{ startMinute: 0, endMinute: 10 * 60 }]);
  });

  it('a time-off ending after the viewed day clamps its end to end of day', () => {
    const result = buildDayShading(
      [],
      [],
      [
        {
          staff_id: 'a',
          starts_at: '2026-06-15T10:00:00.000Z',
          ends_at: '2026-06-16T10:00:00.000Z',
          is_all_day: false,
          branch_id: null,
        },
      ],
      'branch-1',
      DAY_RANGE,
      ZONE,
    );
    expect(result.get('a')?.closedIntervals).toEqual([
      { startMinute: 10 * 60, endMinute: 24 * 60 },
    ]);
  });

  it('time off at a DIFFERENT branch is excluded', () => {
    const result = buildDayShading(
      [],
      [],
      [
        {
          staff_id: 'a',
          starts_at: '2026-06-15T10:00:00.000Z',
          ends_at: '2026-06-15T12:00:00.000Z',
          is_all_day: false,
          branch_id: 'branch-2',
        },
      ],
      'branch-1',
      DAY_RANGE,
      ZONE,
    );
    expect(result.get('a')).toBeUndefined();
  });

  it('time off with branch_id null (every branch) is INCLUDED regardless of the viewed branch', () => {
    const result = buildDayShading(
      [],
      [],
      [
        {
          staff_id: 'a',
          starts_at: '2026-06-15T10:00:00.000Z',
          ends_at: '2026-06-15T12:00:00.000Z',
          is_all_day: false,
          branch_id: null,
        },
      ],
      'branch-1',
      DAY_RANGE,
      ZONE,
    );
    expect(result.get('a')?.closedIntervals).toHaveLength(1);
  });

  it('is empty for no rows at all', () => {
    const result = buildDayShading([], [], [], 'branch-1', DAY_RANGE, ZONE);
    expect(result.size).toBe(0);
  });
});
