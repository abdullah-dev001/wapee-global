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

/** Pixels per hour of the grid. 96 makes a 30-min appointment 48px tall: two readable lines and a 44px touch target. */
export const HOUR_HEIGHT_PX = 96;

/** No card is shorter than this, so even a 15-min appointment keeps one readable line. */
export const MIN_BLOCK_HEIGHT_PX = 28;

/** Card height in px for a start/end, never below `MIN_BLOCK_HEIGHT_PX`. */
export function blockHeightPx(
  startMinute: MinuteOfDay,
  endMinute: MinuteOfDay,
  hours: GridHours = DEFAULT_GRID_HOURS,
): number {
  return Math.max(
    MIN_BLOCK_HEIGHT_PX,
    minuteToOffsetPx(endMinute, hours) - minuteToOffsetPx(startMinute, hours),
  );
}

export type BlockDetail = 'compact' | 'standard' | 'full';

/**
 * How much a card shows for its height: `compact` = one line (time + client),
 * `standard` = time line + client line, `full` = also the service (and status badge).
 */
export function blockDetailForHeight(heightPx: number): BlockDetail {
  if (heightPx >= 76) return 'full';
  if (heightPx >= 44) return 'standard';
  return 'compact';
}

/** Top offset, in px, of each whole-hour label/line: the SAME maths the cards use. */
export function hourLabelOffsets(
  hours: GridHours = DEFAULT_GRID_HOURS,
): { hour: number; topPx: number }[] {
  const out: { hour: number; topPx: number }[] = [];
  for (let hour = hours.startHour; hour <= hours.endHour; hour += 1) {
    out.push({ hour, topPx: minuteToOffsetPx(hour * 60, hours) });
  }
  return out;
}

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
    // h23 so midnight is 00, not 24 (hour12:false gives "24" on some engines).
    hourCycle: 'h23',
  }).formatToParts(new Date(date));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}
