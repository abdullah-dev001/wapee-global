import { describe, expect, it } from 'vitest';

import type { Grant, GrantSet } from '@/lib/permissions/types';
import { type UtcIso } from '@/lib/time';

import {
  canRescheduleStatus,
  canShowReschedule,
  eligibleStaff,
  initialRescheduleValues,
  rescheduleInput,
  rescheduleScope,
} from './reschedule';

const BRANCH = 'branch-a';
const OTHER = 'branch-b';

function set(grants: Grant[], extra: Partial<GrantSet> = {}): GrantSet {
  return {
    businessId: 'biz',
    grants,
    isActive: true,
    features: {} as GrantSet['features'],
    isSuperAdmin: false,
    ...extra,
  };
}

const edit = (scope: Grant['scope'], branchId: string | null = BRANCH): Grant => ({
  permission: 'appointments.edit',
  scope,
  branchId,
});

describe('canRescheduleStatus', () => {
  it('allows only live bookings (mirrors update_appointment not_editable)', () => {
    expect(canRescheduleStatus('pending')).toBe(true);
    expect(canRescheduleStatus('confirmed')).toBe(true);
    expect(canRescheduleStatus('cancelled')).toBe(false);
    expect(canRescheduleStatus('completed')).toBe(false);
    expect(canRescheduleStatus('no_show')).toBe(false);
  });
});

describe('rescheduleScope', () => {
  it('is none without appointments.edit', () => {
    expect(rescheduleScope(set([]), BRANCH)).toBe('none');
  });

  it('is branch for a Branch grant at this branch, or an All grant', () => {
    expect(rescheduleScope(set([edit('branch')]), BRANCH)).toBe('branch');
    expect(rescheduleScope(set([edit('branch', null)]), BRANCH)).toBe('branch');
    expect(rescheduleScope(set([edit('all', OTHER)]), BRANCH)).toBe('branch');
  });

  it('is own for an Own grant (Staff)', () => {
    expect(rescheduleScope(set([edit('own')]), BRANCH)).toBe('own');
  });

  it('is none for a Branch grant at another branch only', () => {
    expect(rescheduleScope(set([edit('branch', OTHER)]), BRANCH)).toBe('none');
  });

  it('is none while the business is inactive (ended trial)', () => {
    expect(rescheduleScope(set([edit('all')], { isActive: false }), BRANCH)).toBe('none');
  });

  it('is branch for a super admin', () => {
    expect(rescheduleScope(set([], { isSuperAdmin: true }), BRANCH)).toBe('branch');
  });
});

describe('canShowReschedule', () => {
  const mine = { status: 'confirmed' as const, staffId: 'me' };
  const theirs = { status: 'confirmed' as const, staffId: 'someone-else' };

  it('branch scope sees it on any live appointment', () => {
    expect(canShowReschedule(theirs, 'branch', null)).toBe(true);
    expect(canShowReschedule({ ...theirs, status: 'pending' }, 'branch', null)).toBe(true);
  });

  it('own scope sees it only on their own appointments', () => {
    expect(canShowReschedule(mine, 'own', 'me')).toBe(true);
    expect(canShowReschedule(theirs, 'own', 'me')).toBe(false);
    expect(canShowReschedule({ ...mine, staffId: null }, 'own', null)).toBe(false);
  });

  it('never for a finished appointment or without permission', () => {
    expect(canShowReschedule({ ...mine, status: 'completed' }, 'branch', 'me')).toBe(false);
    expect(canShowReschedule({ ...mine, status: 'cancelled' }, 'branch', 'me')).toBe(false);
    expect(canShowReschedule(mine, 'none', 'me')).toBe(false);
  });
});

describe('initialRescheduleValues / rescheduleInput (branch timezone)', () => {
  const tz = 'America/New_York';
  // 2026-11-02 14:30 UTC = 09:30 New York (EST, after the Nov 1 fall-back).
  const appointment = { startsAt: '2026-11-02T14:30:00.000Z' as UtcIso, staffId: 'staff-1' };

  it('starts from the current slot seen in the branch timezone, not the device', () => {
    expect(initialRescheduleValues(appointment, tz)).toEqual({
      date: '2026-11-02',
      minute: 9 * 60 + 30,
      staffId: 'staff-1',
    });
  });

  it('returns null when nothing changed', () => {
    const values = initialRescheduleValues(appointment, tz);
    expect(rescheduleInput(appointment, values, tz)).toBeNull();
  });

  it('sends only the new time when only the time changed', () => {
    const values = { date: '2026-11-02', minute: 11 * 60, staffId: 'staff-1' };
    expect(rescheduleInput(appointment, values, tz)).toEqual({
      startsAt: '2026-11-02T16:00:00.000Z',
    });
  });

  it('sends only the staff when only the staff changed', () => {
    const values = { ...initialRescheduleValues(appointment, tz), staffId: 'staff-2' };
    expect(rescheduleInput(appointment, values, tz)).toEqual({ staffId: 'staff-2' });
  });

  it('resolves the wall-clock time across the DST change (EDT before Nov 1)', () => {
    // Same 09:30 local, one week earlier: EDT (UTC-4), so 13:30 UTC, not 14:30.
    const values = { date: '2026-10-26', minute: 9 * 60 + 30, staffId: 'staff-1' };
    expect(rescheduleInput(appointment, values, tz)).toEqual({
      startsAt: '2026-10-26T13:30:00.000Z',
    });
  });
});

describe('eligibleStaff', () => {
  const staff = [
    { id: 'a', branchIds: [BRANCH], serviceIds: ['svc'], isActive: true },
    { id: 'b', branchIds: [BRANCH], serviceIds: ['other'], isActive: true },
    { id: 'c', branchIds: [OTHER], serviceIds: ['svc'], isActive: true },
    { id: 'd', branchIds: [BRANCH], serviceIds: ['svc'], isActive: false },
    { id: 'e', branchIds: [], serviceIds: ['svc'], isActive: true },
  ];

  it('offers only active staff at this branch who do this service (as update_appointment requires)', () => {
    expect(eligibleStaff(staff, 'svc', BRANCH, null).map((s) => s.id)).toEqual(['a']);
  });

  it('keeps the current staff member so the picker shows the existing choice', () => {
    expect(eligibleStaff(staff, 'svc', BRANCH, 'b').map((s) => s.id)).toEqual(['a', 'b']);
  });
});
