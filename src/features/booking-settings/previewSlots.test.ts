import { describe, expect, it } from 'vitest';

import { buildPreviewSlots, resolveIntervalMinutes } from './previewSlots';

describe('resolveIntervalMinutes', () => {
  it('maps the fixed modes', () => {
    expect(resolveIntervalMinutes('min_15', 60)).toBe(15);
    expect(resolveIntervalMinutes('min_30', 60)).toBe(30);
    expect(resolveIntervalMinutes('min_60', 60)).toBe(60);
  });

  it('uses the service duration for service_length, as the engine does', () => {
    // The engine steps by duration ONLY, never duration + buffer.
    expect(resolveIntervalMinutes('service_length', 45)).toBe(45);
  });

  it('never returns a step small enough to hang the loop', () => {
    expect(resolveIntervalMinutes('service_length', 0)).toBe(5);
    expect(resolveIntervalMinutes('service_length', -10)).toBe(5);
  });
});

describe('buildPreviewSlots', () => {
  const base = {
    openMinute: 540, // 09:00
    closeMinute: 1020, // 17:00
    serviceDurationMinutes: 60,
  };

  it('leaves room for the service in the last slot, as the engine does', () => {
    const slots = buildPreviewSlots({ ...base, intervalMinutes: 60 });
    // 09:00..16:00 inclusive = 8 slots; 17:00 would not fit a 60-minute service.
    expect(slots).toHaveLength(8);
    expect(slots[0]?.localMinute).toBe(540);
    expect(slots.at(-1)?.localMinute).toBe(960); // 16:00
  });

  it('produces more slots on a shorter interval', () => {
    const hourly = buildPreviewSlots({ ...base, intervalMinutes: 60 });
    const quarterly = buildPreviewSlots({ ...base, intervalMinutes: 15 });
    expect(quarterly.length).toBeGreaterThan(hourly.length);
    // 09:00..16:00 every 15 min = 29.
    expect(quarterly).toHaveLength(29);
  });

  it('marks the same slots taken every time, so the preview does not reshuffle', () => {
    const a = buildPreviewSlots({ ...base, intervalMinutes: 60 });
    const b = buildPreviewSlots({ ...base, intervalMinutes: 60 });
    expect(a.map((s) => s.available)).toEqual(b.map((s) => s.available));
    // The defaults mark indexes 1 and 4.
    expect(a[1]?.available).toBe(false);
    expect(a[4]?.available).toBe(false);
    expect(a[0]?.available).toBe(true);
  });

  it('honours an explicit taken list', () => {
    const slots = buildPreviewSlots({ ...base, intervalMinutes: 60, takenIndexes: [0] });
    expect(slots[0]?.available).toBe(false);
    expect(slots[1]?.available).toBe(true);
  });

  it('returns nothing when the service is longer than the day', () => {
    // Honest rather than clamped: an owner with a 10-hour service in an 8-hour day
    // should see that it cannot be booked.
    const slots = buildPreviewSlots({
      openMinute: 540,
      closeMinute: 1020,
      serviceDurationMinutes: 600,
      intervalMinutes: 60,
    });
    expect(slots).toEqual([]);
  });

  it('caps the list so a tiny interval cannot generate thousands of chips', () => {
    const slots = buildPreviewSlots({
      openMinute: 0,
      closeMinute: 1440,
      serviceDurationMinutes: 5,
      intervalMinutes: 5,
    });
    expect(slots).toHaveLength(64);
  });

  it('gives every slot a distinct key-safe id', () => {
    const slots = buildPreviewSlots({ ...base, intervalMinutes: 15 });
    expect(new Set(slots.map((s) => s.startsAt)).size).toBe(slots.length);
  });
});
