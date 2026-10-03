/**
 * Sample slots for the settings live preview.
 *
 * WHY NOT CALL THE REAL ENGINE
 * ----------------------------
 * `get_slots` is a public, rate-limited endpoint, and — more importantly — it
 * reads the SAVED settings. A live preview has to react to the value the owner is
 * dragging right now, which is not saved yet, so asking the server would show the
 * old behaviour and burn quota doing it.
 *
 * So the preview generates its own grid locally. It deliberately models only the
 * parts of the engine an owner can see changing from this screen:
 *
 *   * the slot interval (15 / 30 / 60 / service length)
 *   * the service duration, so the last slot leaves room
 *   * which slots are taken, so `all_greyed` has something to grey
 *
 * It does NOT model breaks, time off, closures, buffers, notice or the booking
 * window. Those depend on data this screen does not load, and faking them would
 * make the preview a second implementation of the engine that quietly disagrees
 * with it. The preview is labelled as sample times for exactly this reason.
 */

import type { PublicSlot } from '@/features/booking-public';

export type PreviewSlotOptions = {
  /** Minutes from local midnight the sample day opens. */
  openMinute: number;
  /** Minutes from local midnight the sample day closes. */
  closeMinute: number;
  /** Resolved interval in minutes (service_length is resolved by the caller). */
  intervalMinutes: number;
  serviceDurationMinutes: number;
  /**
   * Which slots to mark taken, as indexes into the generated list. Fixed rather
   * than random so the preview does not reshuffle on every keystroke, which would
   * look like a bug.
   */
  takenIndexes?: readonly number[];
};

/** The interval in minutes, given the mode and the service length. */
export function resolveIntervalMinutes(
  mode: 'min_15' | 'min_30' | 'min_60' | 'service_length',
  serviceDurationMinutes: number,
): number {
  switch (mode) {
    case 'min_15':
      return 15;
    case 'min_30':
      return 30;
    case 'min_60':
      return 60;
    case 'service_length':
      // Mirrors the engine: it steps by the DURATION ONLY, never duration+buffer.
      return Math.max(5, serviceDurationMinutes);
  }
}

/**
 * Build the sample grid.
 *
 * The last candidate must leave room for the service itself, which is the one
 * engine rule that visibly changes the number of slots when the owner edits the
 * interval — so it is worth mirroring exactly.
 */
export function buildPreviewSlots({
  openMinute,
  closeMinute,
  intervalMinutes,
  serviceDurationMinutes,
  takenIndexes = [1, 4],
}: PreviewSlotOptions): PublicSlot[] {
  const slots: PublicSlot[] = [];
  const interval = Math.max(5, Math.round(intervalMinutes));
  const lastStart = closeMinute - serviceDurationMinutes;

  // A service longer than the whole sample day yields nothing, which is the
  // honest answer and shows the owner something is wrong.
  for (let minute = openMinute; minute <= lastStart; minute += interval) {
    const index = slots.length;
    slots.push({
      // A stable synthetic instant: the preview never sends these anywhere, and a
      // real date would imply the slot is bookable.
      startsAt: `preview-${minute}`,
      localMinute: minute,
      available: !takenIndexes.includes(index),
    });

    // A guard against a pathological interval making this loop huge. 64 chips is
    // already more than a preview needs to show the shape of a day.
    if (slots.length >= 64) break;
  }

  return slots;
}
