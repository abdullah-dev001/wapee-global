import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRID_HOURS,
  blockDetailForHeight,
  blockHeightPx,
  gridHeightPx,
  HOUR_HEIGHT_PX,
  hourLabelOffsets,
  MIN_BLOCK_HEIGHT_PX,
  layoutOverlappingBlocks,
  minuteOfDayFromTime,
  minuteToOffsetPx,
  offsetPxToMinute,
} from './timeGrid';

describe('minuteToOffsetPx / offsetPxToMinute', () => {
  it('maps the grid start to 0', () => {
    expect(minuteToOffsetPx(DEFAULT_GRID_HOURS.startHour * 60)).toBe(0);
  });

  it('maps one hour in to one row height', () => {
    expect(minuteToOffsetPx(DEFAULT_GRID_HOURS.startHour * 60 + 60)).toBe(HOUR_HEIGHT_PX);
  });

  it('maps a half hour to half a row height', () => {
    expect(minuteToOffsetPx(DEFAULT_GRID_HOURS.startHour * 60 + 30)).toBe(HOUR_HEIGHT_PX / 2);
  });

  it('clamps before the grid start', () => {
    expect(minuteToOffsetPx(0)).toBe(0);
  });

  it('clamps after the grid end', () => {
    expect(minuteToOffsetPx(24 * 60)).toBe(gridHeightPx());
  });

  it('round-trips through offsetPxToMinute', () => {
    const minute = DEFAULT_GRID_HOURS.startHour * 60 + 90;
    expect(offsetPxToMinute(minuteToOffsetPx(minute))).toBe(minute);
  });
});

describe('layoutOverlappingBlocks', () => {
  it('gives a single non-overlapping block its own full-width column', () => {
    const [block] = layoutOverlappingBlocks([{ id: 'a', startMinute: 600, endMinute: 660 }]);
    expect(block).toMatchObject({ column: 0, columnCount: 1 });
  });

  it('places two overlapping blocks side by side', () => {
    const laidOut = layoutOverlappingBlocks([
      { id: 'a', startMinute: 600, endMinute: 660 },
      { id: 'b', startMinute: 620, endMinute: 680 },
    ]);
    const a = laidOut.find((block) => block.id === 'a');
    const b = laidOut.find((block) => block.id === 'b');
    expect(a?.column).toBe(0);
    expect(b?.column).toBe(1);
    expect(a?.columnCount).toBe(2);
    expect(b?.columnCount).toBe(2);
  });

  it('reuses a freed column for a third, non-overlapping block in the same group', () => {
    // a: 600-630, b: 600-700 (overlaps a), c: 630-660 (a has ended, fits in a's old column)
    const laidOut = layoutOverlappingBlocks([
      { id: 'a', startMinute: 600, endMinute: 630 },
      { id: 'b', startMinute: 600, endMinute: 700 },
      { id: 'c', startMinute: 630, endMinute: 660 },
    ]);
    const a = laidOut.find((block) => block.id === 'a');
    const b = laidOut.find((block) => block.id === 'b');
    const c = laidOut.find((block) => block.id === 'c');
    expect(a?.column).toBe(0);
    expect(b?.column).toBe(1);
    expect(c?.column).toBe(0);
    expect(a?.columnCount).toBe(2);
    expect(b?.columnCount).toBe(2);
    expect(c?.columnCount).toBe(2);
  });

  it('keeps two separate, non-overlapping groups independent', () => {
    const laidOut = layoutOverlappingBlocks([
      { id: 'a', startMinute: 600, endMinute: 630 },
      { id: 'b', startMinute: 620, endMinute: 650 },
      { id: 'c', startMinute: 800, endMinute: 830 },
    ]);
    const c = laidOut.find((block) => block.id === 'c');
    expect(c?.column).toBe(0);
    expect(c?.columnCount).toBe(1);
  });

  it('is empty for no blocks', () => {
    expect(layoutOverlappingBlocks([])).toEqual([]);
  });
});

describe('minuteOfDayFromTime', () => {
  it('reads the minute of day in the given zone', () => {
    // 13:30 UTC = 14:30 in London (BST, June).
    expect(minuteOfDayFromTime('2026-06-15T13:30:00.000Z', 'Europe/London')).toBe(14 * 60 + 30);
    // 13:30 UTC = 18:30 in Karachi (+05:00, no DST).
    expect(minuteOfDayFromTime('2026-06-15T13:30:00.000Z', 'Asia/Karachi')).toBe(18 * 60 + 30);
  });
});

describe('card height and detail', () => {
  it('gives a 30-minute appointment a readable two-line card', () => {
    const height = blockHeightPx(12 * 60, 12 * 60 + 30);
    expect(height).toBe(HOUR_HEIGHT_PX / 2);
    expect(blockDetailForHeight(height)).toBe('standard');
  });
  it('never goes below the minimum height', () => {
    expect(blockHeightPx(12 * 60, 12 * 60 + 5)).toBe(MIN_BLOCK_HEIGHT_PX);
    expect(blockDetailForHeight(MIN_BLOCK_HEIGHT_PX)).toBe('compact');
  });
  it('shows the service from one hour up', () => {
    expect(blockDetailForHeight(blockHeightPx(12 * 60, 13 * 60))).toBe('full');
  });
});

describe('hour labels line up with cards', () => {
  it('puts the 12 PM label exactly where a 12:00 card starts', () => {
    const label = hourLabelOffsets().find((entry) => entry.hour === 12);
    expect(label?.topPx).toBe(minuteToOffsetPx(12 * 60));
  });
  it('spaces labels exactly one hour height apart (no drift)', () => {
    const tops = hourLabelOffsets().map((entry) => entry.topPx);
    tops.slice(1).forEach((top, index) => expect(top - (tops[index] as number)).toBe(HOUR_HEIGHT_PX));
  });
});

describe('minuteOfDayFromTime in the business zone', () => {
  it('reads 12:00 America/New_York for 16:00Z in October (EDT)', () => {
    expect(minuteOfDayFromTime('2026-10-12T16:00:00Z', 'America/New_York')).toBe(12 * 60);
  });
  it('does not depend on the browser zone and never returns 24:00', () => {
    expect(minuteOfDayFromTime('2026-10-12T04:00:00Z', 'America/New_York')).toBe(0);
  });
});
