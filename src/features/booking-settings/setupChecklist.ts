/**
 * The "Get ready for your first booking" checklist on Today, as pure functions.
 *
 * It adds NO rules of its own. Every step is read from the reason codes of
 * `branch_is_bookable()` (the same codes, order and fix routes as `BookingWarnings`), so the
 * checklist, the warnings and the public page can never disagree about what is missing.
 *
 * `branch_is_bookable` only emits a reason when the thing BEFORE it exists (it reports
 * `no_staffed_service` only once a service and a staff member exist, and `no_staff_hours` only
 * once a staffed service exists). So a step counts as done only when its own reason is absent
 * AND the steps it depends on are done; otherwise "absent" would mean "not evaluated yet".
 */
import {
  bookingWarnings,
  fixRouteFor,
  type BookableReason,
  type BookingFixRoute,
  type BranchBookable,
} from './bookingWarnings';

export type SetupStepId =
  'hours' | 'service' | 'staff' | 'link_service' | 'staff_hours' | 'enable_booking';

export type SetupStep = {
  id: SetupStepId;
  /** The `branch_is_bookable` reason this step answers. */
  reason: BookableReason;
  done: boolean;
  /** The screen that fixes it: the same route `BookingWarnings` uses. */
  route: BookingFixRoute | '/settings/booking';
};

const has = (bookable: BranchBookable, reason: BookableReason) => bookable.reasons.includes(reason);

/**
 * The steps, in the order an owner can actually do them. `enable_booking` is listed only while
 * online booking is switched off (a deliberate choice elsewhere, so it is not a standing step).
 * Returns [] until the bookable state is known.
 */
export function setupSteps(bookable: BranchBookable | null | undefined): SetupStep[] {
  if (!bookable) return [];

  const hours = !has(bookable, 'no_branch_hours');
  const service = !has(bookable, 'no_bookable_service');
  const staff = !has(bookable, 'no_bookable_staff');
  const linked = service && staff && !has(bookable, 'no_staffed_service');
  const staffHours = linked && !has(bookable, 'no_staff_hours');

  const steps: SetupStep[] = [
    {
      id: 'hours',
      reason: 'no_branch_hours',
      done: hours,
      route: fixRouteFor('no_branch_hours') ?? '/schedule',
    },
    {
      id: 'service',
      reason: 'no_bookable_service',
      done: service,
      route: fixRouteFor('no_bookable_service') ?? '/services',
    },
    {
      id: 'staff',
      reason: 'no_bookable_staff',
      done: staff,
      route: fixRouteFor('no_bookable_staff') ?? '/staff',
    },
    {
      id: 'link_service',
      reason: 'no_staffed_service',
      done: linked,
      route: fixRouteFor('no_staffed_service') ?? '/services',
    },
    {
      id: 'staff_hours',
      reason: 'no_staff_hours',
      done: staffHours,
      route: fixRouteFor('no_staff_hours') ?? '/staff',
    },
  ];
  if (has(bookable, 'booking_disabled')) {
    steps.push({
      id: 'enable_booking',
      reason: 'booking_disabled',
      done: false,
      route: '/settings/booking',
    });
  }
  return steps;
}

export type SetupProgress = {
  done: number;
  /** The listed steps plus the final "copy your booking link". */
  total: number;
  /** 0..1, for the progress bar. */
  ratio: number;
};

/** The final step (copy the link) is part of the total and only counts once the card is dismissed. */
export function setupProgress(steps: readonly SetupStep[]): SetupProgress {
  const done = steps.filter((step) => step.done).length;
  const total = steps.length + 1;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/** The first thing still to do, which the card highlights. */
export function nextSetupStep(steps: readonly SetupStep[]): SetupStep | null {
  return steps.find((step) => !step.done) ?? null;
}

/** All listed steps done, i.e. the branch really can take a booking. */
export function setupStepsComplete(bookable: BranchBookable | null | undefined): boolean {
  return bookable?.bookable === true;
}

export type SetupCardMode =
  /** Nothing to show (unknown yet, finished, or dismissed with nothing broken). */
  | 'hidden'
  /** The full checklist. */
  | 'checklist'
  /** Dismissed earlier, but booking has become unavailable: a small reminder. */
  | 'banner';

/**
 * What the Today screen shows.
 *
 * - not dismissed: the checklist (it ends with the "copy your link" step, so a finished setup
 *   still shows it until the link is copied or the card is dismissed)
 * - dismissed: nothing while booking works, and a small banner when a required setup item is
 *   missing again. `booking_disabled` alone does not trigger it: that is a deliberate switch.
 */
export function setupCardMode(
  bookable: BranchBookable | null | undefined,
  dismissed: boolean,
): SetupCardMode {
  if (!bookable) return 'hidden';
  if (!dismissed) return 'checklist';
  const broken = bookable.reasons.some((reason) => reason !== 'booking_disabled');
  return broken ? 'banner' : 'hidden';
}

/**
 * The first missing required item, for the banner text: the first error of the booking
 * warnings, so the order is theirs and not a second copy.
 */
export function firstMissingReason(
  bookable: BranchBookable | null | undefined,
): BookableReason | null {
  const first = bookingWarnings(bookable).find(
    (warning) => warning.severity === 'error' && warning.code !== 'buffer_override',
  );
  return first && first.code !== 'buffer_override' ? first.code : null;
}
