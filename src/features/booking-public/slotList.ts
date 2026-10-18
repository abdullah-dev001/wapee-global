import type { PublicSlot } from './types';

/**
 * One chip per start time (QA F24).
 *
 * For "Any staff", `get_slots` returns one row per free staff member per start,
 * so two free people showed every time twice and selecting one highlighted
 * both. The customer picks a TIME; the server picks the person. A start is
 * available when any row for it is. Order is kept (first occurrence wins).
 */
export function uniqueSlotsByStart(slots: readonly PublicSlot[]): PublicSlot[] {
  const byStart = new Map<string, PublicSlot>();
  for (const slot of slots) {
    const seen = byStart.get(slot.startsAt);
    if (!seen) {
      byStart.set(slot.startsAt, slot);
    } else if (!seen.available && slot.available) {
      byStart.set(slot.startsAt, { ...seen, available: true });
    }
  }
  return [...byStart.values()];
}
