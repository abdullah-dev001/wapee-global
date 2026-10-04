import { type MinuteOfDay } from '@/lib/time';

/**
 * Pure time-grid maths for the Day/Week calendar: minute-of-day <-> pixel
 * offsets, and the sweep-line column assignment that lays out overlapping
 * appointments side by side within a staff column. No React, no RN, no DB —
 * kept pure so it is unit-testable and reusable between Day and Week.
 */

/** One visible hour row, e.g. 7 for 07:00. The grid always shows whole hours. */
export type GridHours = { startHour: number; endHour: number };

export const DEFAULT_GRID_HOURS: GridHours = { startHour: 7, endHour: 21 };

/** Pixels per hour of the grid. Fixed so touch targets stay >= 44px tall for a 30-min slot. */
export const HOUR_HEIGHT_PX = 64;

/** Vertical offset, in px, of a minute-of-day within the grid. Clamped to the grid's range. */
export function minuteToOffsetPx(
  minute: MinuteOfDay,
  hours: GridHours = DEFAULT_GRID_HOURS,
): number {
  const gridStartMinute = hours.startHour * 60;
  const gridEndMinute = hours.endHour * 60;
  const clamped = Math.max(gridStartMinute, Math.min(gridEndMinute, minute));
  return ((clamped - gridStartMinute) / 60) * HOUR_HEIGHT_PX;
}

/** Inverse of `minuteToOffsetPx`: the minute-of-day at a given vertical offset. */
export function offsetPxToMinute(
  offsetPx: number,
  hours: GridHours = DEFAULT_GRID_HOURS,
): MinuteOfDay {
  const gridStartMinute = hours.startHour * 60;
  const gridEndMinute = hours.endHour * 60;
  const minute = gridStartMinute + (offsetPx / HOUR_HEIGHT_PX) * 60;
  return Math.max(gridStartMinute, Math.min(gridEndMinute, Math.round(minute)));
}

/** Total grid height in px for the given hour range. */
export function gridHeightPx(hours: GridHours = DEFAULT_GRID_HOURS): number {
  return (hours.endHour - hours.startHour) * HOUR_HEIGHT_PX;
}

/** One block to lay out: a start/end in minute-of-day, plus an opaque id. */
export type LayoutBlock = { id: string; startMinute: MinuteOfDay; endMinute: MinuteOfDay };

/** A laid-out block: its column index and the total column count of its overlap group. */
export type LaidOutBlock<T extends LayoutBlock> = T & { column: number; columnCount: number };

/**
 * Assigns each block a column (0-based) and a column count, so overlapping
 * appointments in the same staff column render side by side instead of
 * stacking on top of each other. A classic interval sweep: sort by start,
 * greedily pack into the first free column, then every block touched by the
 * same connected overlap group shares that group's column count.
 */
export function layoutOverlappingBlocks<T extends LayoutBlock>(blocks: T[]): LaidOutBlock<T>[] {
  const sorted = [...blocks].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
  const result: LaidOutBlock<T>[] = [];

  let group: LaidOutBlock<T>[] = [];
  let groupEndMinute = -Infinity;

  const flushGroup = () => {
    if (group.length === 0) return;
    const columnCount = Math.max(...group.map((block) => block.column)) + 1;
    for (const block of group) {
      result.push({ ...block, columnCount });
    }
    group = [];
  };

  for (const block of sorted) {
    if (block.startMinute >= groupEndMinute) {
      flushGroup();
      groupEndMinute = -Infinity;
    }

    // First free column among the still-open blocks in this group.
    const openEndsByColumn = new Map<number, number>();
    for (const existing of group) {
      openEndsByColumn.set(existing.column, existing.endMinute);
    }
    let column = 0;
    while (
      openEndsByColumn.has(column) &&
      (openEndsByColumn.get(column) as number) > block.startMinute
    ) {
      column += 1;
    }

    group.push({ ...block, column, columnCount: 1 });
    groupEndMinute = Math.max(groupEndMinute, block.endMinute);
  }
  flushGroup();

  return result;
}

/** Minute-of-day "now" is at, in a given zone — for the current-time line. Pure given the instant. */
export function minuteOfDayFromTime(date: string, zone: string): MinuteOfDay {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(date));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}
