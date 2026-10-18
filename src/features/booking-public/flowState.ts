/**
 * The public booking page's step state machine, as pure functions.
 *
 * Kept out of the screen component so it can be unit-tested without a renderer
 * (CLAUDE.md §10a) and so the "what step comes next / can I go back" logic has
 * one place to live rather than being scattered across event handlers.
 *
 * The flow is always: service -> staff (maybe skipped) -> slot -> form ->
 * confirmation. "Maybe skipped" is the only branch: doc §6.2's staff_choice
 * 'hidden' means the staff step never appears at all.
 */

export type StaffChoiceMode = 'hidden' | 'optional' | 'required';

export type BookingStep = 'service' | 'staff' | 'slot' | 'form' | 'confirmation';

export type BookingFlowState = {
  serviceId: string | null;
  /** null = "Any staff" (only meaningful when staffChoice is 'optional'). */
  staffId: string | null;
  staffChosen: boolean;
  startsAt: string | null;
};

export const initialFlowState: BookingFlowState = {
  serviceId: null,
  staffId: null,
  staffChosen: false,
  startsAt: null,
};

/** The ordered steps for this branch's staff_choice setting. */
export function stepsFor(staffChoice: StaffChoiceMode): readonly BookingStep[] {
  if (staffChoice === 'hidden') {
    return ['service', 'slot', 'form', 'confirmation'];
  }
  return ['service', 'staff', 'slot', 'form', 'confirmation'];
}

/** Which step the state is currently on, given what has been filled in. */
export function currentStep(
  state: BookingFlowState,
  staffChoice: StaffChoiceMode,
  confirmed: boolean,
): BookingStep {
  if (confirmed) return 'confirmation';
  if (!state.serviceId) return 'service';
  if (staffChoice !== 'hidden' && !state.staffChosen) return 'staff';
  if (!state.startsAt) return 'slot';
  return 'form';
}

/** The step to land on after going "back" from `step`. null = exit the flow. */
export function previousStep(step: BookingStep, staffChoice: StaffChoiceMode): BookingStep | null {
  const steps = stepsFor(staffChoice);
  const index = steps.indexOf(step);
  if (index <= 0) return null;
  return steps[index - 1] ?? null;
}

/**
 * How many browser-history entries this step owns above the page (QA F26): its
 * position in the flow, so Back steps back one step. The confirmation owns
 * none: after a booking, Back leaves the page instead of reopening the form.
 */
export function historyDepth(step: BookingStep, staffChoice: StaffChoiceMode): number {
  if (step === 'confirmation') return 0;
  return Math.max(0, stepsFor(staffChoice).indexOf(step));
}

/** Reset the fields that stop being valid when an earlier choice changes. */
export function resetFrom(state: BookingFlowState, step: BookingStep): BookingFlowState {
  switch (step) {
    case 'service':
      return { ...initialFlowState };
    case 'staff':
      return { ...state, staffId: null, staffChosen: false, startsAt: null };
    case 'slot':
      return { ...state, startsAt: null };
    default:
      return state;
  }
}

/** Staff ids allowed for a service, from the get_booking_page service_staff pairs. */
export function staffIdsForService(
  serviceId: string,
  serviceStaff: readonly { serviceId: string; staffId: string }[],
): readonly string[] {
  return serviceStaff.filter((row) => row.serviceId === serviceId).map((row) => row.staffId);
}
