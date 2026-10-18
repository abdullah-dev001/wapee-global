import { describe, expect, it } from 'vitest';

import { uniqueSlotsByStart } from './slotList';
import type { PublicSlot } from './types';

const s = (startsAt: string, available: boolean, staffId: string | null = null): PublicSlot => ({
  startsAt,
  localMinute: 0,
  available,
  staffId,
});

describe('uniqueSlotsByStart', () => {
  it('keeps one chip per start time when two staff are free', () => {
    const out = uniqueSlotsByStart([s('09:00', true, 'ann'), s('09:00', true, 'bob'), s('10:00', true, 'bob')]);
    expect(out.map((x) => x.startsAt)).toEqual(['09:00', '10:00']);
  });

  it('is available when ANY staff is free at that start', () => {
    const out = uniqueSlotsByStart([s('09:00', false, 'ann'), s('09:00', true, 'bob')]);
    expect(out).toHaveLength(1);
    expect(out[0]?.available).toBe(true);
  });

  it('stays unavailable when nobody is free at that start', () => {
    const out = uniqueSlotsByStart([s('09:00', false, 'ann'), s('09:00', false, 'bob')]);
    expect(out[0]?.available).toBe(false);
  });

  it('keeps the original order', () => {
    const out = uniqueSlotsByStart([s('11:00', true), s('09:00', true), s('11:00', true)]);
    expect(out.map((x) => x.startsAt)).toEqual(['11:00', '09:00']);
  });

  it('leaves a single-staff list unchanged', () => {
    const list = [s('09:00', true, 'ann'), s('09:30', false, 'ann')];
    expect(uniqueSlotsByStart(list)).toEqual(list);
  });
});
