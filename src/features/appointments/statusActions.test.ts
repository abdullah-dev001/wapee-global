import { describe, expect, it } from 'vitest';

import {
  actionTimeGate,
  actionsForStatus,
  availabilityFor,
  isActionAvailableForStatus,
  isTerminalStatus,
} from './statusActions';

describe('status -> action mapping (mirrors appointment_status_transitions)', () => {
  it('pending can be approved or cancelled', () => {
    expect(actionsForStatus('pending')).toEqual(['approve', 'cancel']);
  });

  it('confirmed can be cancelled, completed or marked no-show', () => {
    expect(actionsForStatus('confirmed')).toEqual(['cancel', 'complete', 'no_show']);
  });

  it('completed and no_show can only be reopened', () => {
    expect(actionsForStatus('completed')).toEqual(['reopen']);
    expect(actionsForStatus('no_show')).toEqual(['reopen']);
  });

  it('cancelled is permanently terminal', () => {
    expect(actionsForStatus('cancelled')).toEqual([]);
    expect(isTerminalStatus('cancelled')).toBe(true);
  });

  it('no other status is terminal', () => {
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('confirmed')).toBe(false);
    expect(isTerminalStatus('completed')).toBe(false);
    expect(isTerminalStatus('no_show')).toBe(false);
  });

  it('isActionAvailableForStatus agrees with actionsForStatus', () => {
    expect(isActionAvailableForStatus('pending', 'approve')).toBe(true);
    expect(isActionAvailableForStatus('pending', 'complete')).toBe(false);
    expect(isActionAvailableForStatus('cancelled', 'cancel')).toBe(false);
  });
});

describe('availabilityFor', () => {
  it('reopen is role-only (Owner/Manager), not a permission', () => {
    expect(availabilityFor('reopen')).toEqual({ roleOnly: true });
  });

  it('approve/cancel map to their own permission, not appointments.edit', () => {
    expect(availabilityFor('approve')).toEqual({ permission: 'appointments.approve' });
    expect(availabilityFor('cancel')).toEqual({ permission: 'appointments.cancel' });
  });

  it('no_show/complete use appointments.edit', () => {
    expect(availabilityFor('no_show')).toEqual({ permission: 'appointments.edit' });
    expect(availabilityFor('complete')).toEqual({ permission: 'appointments.edit' });
  });
});

describe('actionTimeGate (QA F11)', () => {
  const start = '2026-10-19T12:00:00Z';
  const before = new Date('2026-10-19T11:59:00Z');
  const after = new Date('2026-10-19T12:00:00Z');

  it('hides no-show before the start', () => {
    expect(actionTimeGate('no_show', start, before)).toBe('hidden');
  });
  it('offers no-show from the start', () => {
    expect(actionTimeGate('no_show', start, after)).toBe('ok');
  });
  it('warns when completing before the start', () => {
    expect(actionTimeGate('complete', start, before)).toBe('early');
  });
  it('completes normally after the start', () => {
    expect(actionTimeGate('complete', start, after)).toBe('ok');
  });
  it('does not gate cancel or approve', () => {
    expect(actionTimeGate('cancel', start, before)).toBe('ok');
    expect(actionTimeGate('approve', start, before)).toBe('ok');
  });
});
