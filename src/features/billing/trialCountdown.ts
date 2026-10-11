/**
 * How many days are left of a trial, and whether that is worth warning about.
 *
 * Split out from the component so it can be unit tested — off-by-one errors in a
 * countdown are exactly the kind of thing that ships unnoticed.
 */

/** Warn when this many days or fewer remain. */
export const TRIAL_WARNING_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TrialCountdown = {
  /** Whole days left, floored, never below 0. 0 = ends today. */
  daysLeft: number;
  /** Within the warning window and not yet over. */
  shouldWarn: boolean;
  /** Last day — the banner shifts to a stronger style. */
  isLastDay: boolean;
};

/**
 * Days left until `trialEndsAt`.
 *
 * Counted in whole days from the exact instant, not from midnight: a trial with
 * 30 hours to run reports 1 day ("ends tomorrow"), and anything under 24 hours
 * reports 0 ("ends today"). That errs towards warning sooner, which is the right
 * direction for a countdown the owner must act on.
 */
export function trialCountdown(
  trialEndsAt: string | null,
  status: string | null,
  now: Date = new Date(),
): TrialCountdown {
  const none: TrialCountdown = { daysLeft: 0, shouldWarn: false, isLastDay: false };

  // Only a running trial counts down. An active (paid) business has no trial, and
  // one that has already ended shows the lock screen instead.
  if (status !== 'trialing' || !trialEndsAt) return none;

  const endsAt = new Date(trialEndsAt).getTime();
  if (Number.isNaN(endsAt)) return none;

  const msLeft = endsAt - now.getTime();
  if (msLeft <= 0) return none;

  const daysLeft = Math.floor(msLeft / MS_PER_DAY);

  return {
    daysLeft,
    shouldWarn: daysLeft <= TRIAL_WARNING_DAYS,
    isLastDay: daysLeft === 0,
  };
}
