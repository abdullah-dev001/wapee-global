import { describe, expect, it } from 'vitest';

import {
  CLOCK_SKEW_MS,
  UNDO_WINDOW_MS,
  activeDeductions,
  canUndoNow,
  isUsable,
  packageErrorKey,
  packageState,
  totalSessions,
  type SessionUsage,
} from './packageLogic';

const base = { isCancelled: false, isExpired: false, remaining: 3 };

describe('packageState', () => {
  it('is active with sessions left and not expired or cancelled', () => {
    expect(packageState(base)).toBe('active');
    expect(isUsable(base)).toBe(true);
  });
  it('cancelled beats expired beats used up', () => {
    expect(packageState({ isCancelled: true, isExpired: true, remaining: 0 })).toBe('cancelled');
    expect(packageState({ isCancelled: false, isExpired: true, remaining: 0 })).toBe('expired');
    expect(packageState({ ...base, remaining: 0 })).toBe('used_up');
    expect(isUsable({ ...base, remaining: 0 })).toBe(false);
  });
  it('total is purchased plus bonus', () => {
    expect(totalSessions({ sessionsPurchased: 3, sessionsBonus: 1 })).toBe(4);
  });
});

const usage = (over: Partial<SessionUsage>): SessionUsage => ({
  id: 'u1',
  kind: 'deduct',
  clientPackageId: 'cp1',
  packageName: 'Massage 3+1',
  appointmentId: 'a1',
  reversesUsageId: null,
  reason: null,
  createdAt: '2027-06-01T12:00:00.000Z',
  createdBy: 'me',
  ...over,
});

describe('activeDeductions', () => {
  it('drops a deduction that has a reversal row, keeps the rest newest first', () => {
    const rows = [
      usage({ id: 'u1' }),
      usage({ id: 'r1', kind: 'reversal', reversesUsageId: 'u1' }),
      usage({ id: 'u2', createdAt: '2027-06-01T13:00:00.000Z' }),
    ];
    expect(activeDeductions(rows).map((r) => r.id)).toEqual(['u2']);
  });
});

describe('canUndoNow', () => {
  const t0 = new Date('2027-06-01T12:00:00.000Z').getTime();
  it('the creator may undo up to and including 10 minutes', () => {
    expect(canUndoNow(usage({}), 'me', t0 + UNDO_WINDOW_MS)).toBe(true);
    expect(canUndoNow(usage({}), 'me', t0 + UNDO_WINDOW_MS + 1)).toBe(false);
  });
  it('nobody else may', () => {
    expect(canUndoNow(usage({}), 'someone-else', t0 + 1000)).toBe(false);
    expect(canUndoNow(usage({}), null, t0 + 1000)).toBe(false);
  });
  it('tolerates a device clock slightly behind the server, but not wildly', () => {
    expect(canUndoNow(usage({}), 'me', t0 - 30_000)).toBe(true);
    expect(canUndoNow(usage({}), 'me', t0 - CLOCK_SKEW_MS - 1)).toBe(false);
  });
});

describe('packageErrorKey', () => {
  it('maps known codes and falls back for anything else', () => {
    expect(packageErrorKey('no_sessions_left')).toBe('packages.errors.no_sessions_left');
    expect(packageErrorKey('???')).toBe('packages.errors.unknown');
    expect(packageErrorKey(null)).toBe('packages.errors.unknown');
    expect(packageErrorKey('toString')).toBe('packages.errors.unknown');
  });
});
