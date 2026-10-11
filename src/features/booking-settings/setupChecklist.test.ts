import { describe, expect, it } from 'vitest';

import { type BookableReason, type BranchBookable } from './bookingWarnings';
import {
  firstMissingReason,
  nextSetupStep,
  setupCardMode,
  setupProgress,
  setupSteps,
  setupStepsComplete,
} from './setupChecklist';

const state = (reasons: BookableReason[]): BranchBookable => ({
  bookable: reasons.length === 0,
  reasons,
});

const doneIds = (bookable: BranchBookable) =>
  setupSteps(bookable)
    .filter((step) => step.done)
    .map((step) => step.id);

describe('setupSteps', () => {
  it('is empty until the bookable state is known', () => {
    expect(setupSteps(null)).toEqual([]);
    expect(setupSteps(undefined)).toEqual([]);
  });

  it('a brand-new business has nothing done', () => {
    // branch_is_bookable on a fresh business: hours, service and staff missing (and nothing to link yet)
    const fresh = state(['no_branch_hours', 'no_bookable_service', 'no_bookable_staff']);
    expect(doneIds(fresh)).toEqual([]);
    expect(setupSteps(fresh).map((s) => s.id)).toEqual([
      'hours',
      'service',
      'staff',
      'link_service',
      'staff_hours',
    ]);
  });

  it('does not call "link" or "staff hours" done just because their reason is not reported yet', () => {
    // hours done, service done, NO staff: no_staffed_service / no_staff_hours are not emitted
    const s = state(['no_bookable_staff']);
    expect(doneIds(s)).toEqual(['hours', 'service']);
    // service + staff exist but nobody performs it: link missing, staff hours not evaluated
    const unlinked = state(['no_staffed_service']);
    expect(doneIds(unlinked)).toEqual(['hours', 'service', 'staff']);
  });

  it('marks staff hours as the last missing step once a staffed service exists', () => {
    const s = state(['no_staff_hours']);
    expect(doneIds(s)).toEqual(['hours', 'service', 'staff', 'link_service']);
    expect(nextSetupStep(setupSteps(s))?.id).toBe('staff_hours');
  });

  it('everything done when bookable', () => {
    const ready = state([]);
    expect(doneIds(ready)).toEqual(['hours', 'service', 'staff', 'link_service', 'staff_hours']);
    expect(nextSetupStep(setupSteps(ready))).toBeNull();
    expect(setupStepsComplete(ready)).toBe(true);
  });

  it('adds "turn on online booking" only while booking is switched off', () => {
    const off = state(['booking_disabled']);
    expect(setupSteps(off).at(-1)).toMatchObject({
      id: 'enable_booking',
      done: false,
      route: '/settings/booking',
    });
    expect(setupSteps(state([])).some((s) => s.id === 'enable_booking')).toBe(false);
  });

  it('sends each step to the screen the booking warnings use', () => {
    const routes = Object.fromEntries(
      setupSteps(state(['no_branch_hours'])).map((s) => [s.id, s.route]),
    );
    expect(routes).toEqual({
      hours: '/schedule',
      service: '/services',
      staff: '/staff',
      link_service: '/services',
      staff_hours: '/staff',
    });
  });
});

describe('setupProgress', () => {
  it('counts the final "copy your link" step in the total', () => {
    const p = setupProgress(setupSteps(state(['no_bookable_staff'])));
    expect(p).toMatchObject({ done: 2, total: 6 });
    expect(p.ratio).toBeCloseTo(2 / 6);
  });
  it('is 5 of 6 when every listed step is done (the link is the last one)', () => {
    expect(setupProgress(setupSteps(state([])))).toMatchObject({ done: 5, total: 6 });
  });
});

describe('setupCardMode', () => {
  it('hides while unknown', () => {
    expect(setupCardMode(null, false)).toBe('hidden');
    expect(setupCardMode(undefined, true)).toBe('hidden');
  });
  it('shows the checklist until it is dismissed, even once everything is set up', () => {
    expect(setupCardMode(state(['no_branch_hours']), false)).toBe('checklist');
    expect(setupCardMode(state([]), false)).toBe('checklist');
  });
  it('after a dismissal: nothing while bookable, a banner when setup breaks again', () => {
    expect(setupCardMode(state([]), true)).toBe('hidden');
    expect(setupCardMode(state(['no_staff_hours']), true)).toBe('banner');
    expect(setupCardMode(state(['no_bookable_service', 'no_bookable_staff']), true)).toBe('banner');
  });
  it('booking switched off on purpose is not a banner', () => {
    expect(setupCardMode(state(['booking_disabled']), true)).toBe('hidden');
  });
});

describe('firstMissingReason', () => {
  it('follows the warnings order and ignores the deliberate switch', () => {
    expect(firstMissingReason(state(['no_staff_hours', 'no_bookable_service']))).toBe(
      'no_bookable_service',
    );
    expect(firstMissingReason(state(['booking_disabled']))).toBeNull();
    expect(firstMissingReason(null)).toBeNull();
  });
});
