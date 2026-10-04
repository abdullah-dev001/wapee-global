import { describe, expect, it } from 'vitest';

import {
  currentStep,
  initialFlowState,
  previousStep,
  resetFrom,
  staffIdsForService,
  stepsFor,
  type BookingFlowState,
} from './flowState';

describe('stepsFor', () => {
  it('skips the staff step when staff_choice is hidden', () => {
    expect(stepsFor('hidden')).toEqual(['service', 'slot', 'form', 'confirmation']);
  });

  it('includes the staff step for optional and required', () => {
    expect(stepsFor('optional')).toEqual(['service', 'staff', 'slot', 'form', 'confirmation']);
    expect(stepsFor('required')).toEqual(['service', 'staff', 'slot', 'form', 'confirmation']);
  });
});

describe('currentStep', () => {
  it('starts on service when nothing is picked', () => {
    expect(currentStep(initialFlowState, 'optional', false)).toBe('service');
  });

  it('moves to staff once a service is picked (not hidden)', () => {
    const state: BookingFlowState = { ...initialFlowState, serviceId: 's1' };
    expect(currentStep(state, 'optional', false)).toBe('staff');
  });

  it('skips staff entirely when staff_choice is hidden', () => {
    const state: BookingFlowState = { ...initialFlowState, serviceId: 's1' };
    expect(currentStep(state, 'hidden', false)).toBe('slot');
  });

  it('moves to slot once staff is chosen', () => {
    const state: BookingFlowState = {
      ...initialFlowState,
      serviceId: 's1',
      staffChosen: true,
      staffId: null, // "Any staff" is still a valid choice
    };
    expect(currentStep(state, 'optional', false)).toBe('slot');
  });

  it('moves to form once a slot is picked', () => {
    const state: BookingFlowState = {
      serviceId: 's1',
      staffId: 'st1',
      staffChosen: true,
      startsAt: '2027-01-01T09:00:00Z',
    };
    expect(currentStep(state, 'optional', false)).toBe('form');
  });

  it('reports confirmation once confirmed, regardless of other fields', () => {
    expect(currentStep(initialFlowState, 'optional', true)).toBe('confirmation');
  });
});

describe('previousStep', () => {
  it('returns null when already on the first step', () => {
    expect(previousStep('service', 'optional')).toBeNull();
  });

  it('steps back through the staff step when not hidden', () => {
    expect(previousStep('slot', 'optional')).toBe('staff');
  });

  it('skips the staff step when hidden', () => {
    expect(previousStep('slot', 'hidden')).toBe('service');
  });

  it('goes from form back to slot', () => {
    expect(previousStep('form', 'required')).toBe('slot');
  });
});

describe('resetFrom', () => {
  const filled: BookingFlowState = {
    serviceId: 's1',
    staffId: 'st1',
    staffChosen: true,
    startsAt: '2027-01-01T09:00:00Z',
  };

  it('clears everything when going back to service (a different service may have different staff/slots)', () => {
    expect(resetFrom(filled, 'service')).toEqual(initialFlowState);
  });

  it('clears staff and slot when going back to staff, keeps the service', () => {
    expect(resetFrom(filled, 'staff')).toEqual({
      serviceId: 's1',
      staffId: null,
      staffChosen: false,
      startsAt: null,
    });
  });

  it('clears only the slot when going back to slot', () => {
    expect(resetFrom(filled, 'slot')).toEqual({ ...filled, startsAt: null });
  });

  it('leaves state untouched for form/confirmation', () => {
    expect(resetFrom(filled, 'form')).toEqual(filled);
    expect(resetFrom(filled, 'confirmation')).toEqual(filled);
  });
});

describe('goBack wiring (regression: resetFrom must target the PREVIOUS step)', () => {
  // BookingFlow.tsx computes `prev = previousStep(step, staffChoice)` and must
  // call `resetFrom(state, prev)`, not `resetFrom(state, step)`. Passing the
  // current step clears fields that are already empty, so currentStep() comes
  // out unchanged and the Back button (and Android hardware back) does
  // nothing. This test exercises the real sequence a user triggers.
  function simulateGoBack(
    state: BookingFlowState,
    staffChoice: 'hidden' | 'optional' | 'required',
  ) {
    const step = currentStep(state, staffChoice, false);
    const prev = previousStep(step, staffChoice);
    if (!prev) return state;
    return resetFrom(state, prev);
  }

  it('moves from form back to slot, clearing startsAt', () => {
    const filled: BookingFlowState = {
      serviceId: 's1',
      staffId: 'st1',
      staffChosen: true,
      startsAt: '2027-01-01T09:00:00Z',
    };
    const after = simulateGoBack(filled, 'optional');
    expect(currentStep(after, 'optional', false)).toBe('slot');
  });

  it('moves from slot back to staff, clearing the staff choice', () => {
    const state: BookingFlowState = {
      serviceId: 's1',
      staffId: null,
      staffChosen: true,
      startsAt: null,
    };
    const after = simulateGoBack(state, 'optional');
    expect(currentStep(after, 'optional', false)).toBe('staff');
  });

  it('moves from staff back to service, clearing everything', () => {
    const state: BookingFlowState = {
      serviceId: 's1',
      staffId: null,
      staffChosen: false,
      startsAt: null,
    };
    const after = simulateGoBack(state, 'optional');
    expect(currentStep(after, 'optional', false)).toBe('service');
  });

  it('moves from slot back to service when staff_choice is hidden', () => {
    const state: BookingFlowState = {
      serviceId: 's1',
      staffId: null,
      staffChosen: false,
      startsAt: null,
    };
    const after = simulateGoBack(state, 'hidden');
    expect(currentStep(after, 'hidden', false)).toBe('service');
  });
});

describe('staffIdsForService', () => {
  const pairs = [
    { serviceId: 's1', staffId: 'a' },
    { serviceId: 's1', staffId: 'b' },
    { serviceId: 's2', staffId: 'c' },
  ];

  it('returns only the staff ids for the given service', () => {
    expect(staffIdsForService('s1', pairs)).toEqual(['a', 'b']);
    expect(staffIdsForService('s2', pairs)).toEqual(['c']);
  });

  it('returns an empty list for a service with no staff', () => {
    expect(staffIdsForService('s3', pairs)).toEqual([]);
  });
});
