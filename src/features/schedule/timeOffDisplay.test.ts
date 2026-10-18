import { describe, expect, it } from 'vitest';

import { formatBranchDay, timeOffDisplayRange } from './timeOffDisplay';

const day = (d: Date, tz: string) => formatBranchDay(d, tz, 'en-GB');

describe('timeOffDisplayRange (QA F17)', () => {
  it('shows a London whole day off in BST on the right day', () => {
    // 23 Oct 2026 00:00 BST = 22 Oct 23:00Z; end = 24 Oct 00:00 BST.
    const r = timeOffDisplayRange('2026-10-22T23:00:00Z', '2026-10-23T23:00:00Z');
    expect(day(r.firstInstant, 'Europe/London')).toBe('23 Oct 2026');
    expect(day(r.lastInstant, 'Europe/London')).toBe('23 Oct 2026');
  });

  it('handles a multi-day range ahead of UTC (Karachi)', () => {
    // 5-7 Nov 2026 in Asia/Karachi (UTC+5).
    const r = timeOffDisplayRange('2026-11-04T19:00:00Z', '2026-11-07T19:00:00Z');
    expect(day(r.firstInstant, 'Asia/Karachi')).toBe('5 Nov 2026');
    expect(day(r.lastInstant, 'Asia/Karachi')).toBe('7 Nov 2026');
  });

  it('is right across the autumn DST change (25-hour day)', () => {
    // 25 Oct 2026 in London: 00:00 BST (24 Oct 23:00Z) to 26 Oct 00:00 GMT (26 Oct 00:00Z).
    const r = timeOffDisplayRange('2026-10-24T23:00:00Z', '2026-10-26T00:00:00Z');
    expect(day(r.firstInstant, 'Europe/London')).toBe('25 Oct 2026');
    expect(day(r.lastInstant, 'Europe/London')).toBe('25 Oct 2026');
  });

  it('works behind UTC (New York)', () => {
    // 23 Oct 2026 in New York (EDT, UTC-4): 04:00Z to next 04:00Z.
    const r = timeOffDisplayRange('2026-10-23T04:00:00Z', '2026-10-24T04:00:00Z');
    expect(day(r.firstInstant, 'America/New_York')).toBe('23 Oct 2026');
    expect(day(r.lastInstant, 'America/New_York')).toBe('23 Oct 2026');
  });
});
