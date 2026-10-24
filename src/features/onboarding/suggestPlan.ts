import { type PublicPlan } from '@/features/landing/pricingModel';

/** A team-size answer on onboarding; each one is the band of sizes ONE plan is the smallest fit for. */
export type TeamSizeOption = {
  planKey: string;
  min: number;
  /** null = no upper limit. */
  max: number | null;
};

type CappedPlan = Pick<PublicPlan, 'key' | 'staffCap'>;

/**
 * Builds the answers from the live plans' staff caps (so no team size is hard-coded):
 * caps 1 / 5 / unlimited become "1", "2–5", "6 or more", each pointing at its plan.
 * Ascending by cap; a plan whose cap adds nothing over a cheaper one (same or lower) is
 * skipped, and equal caps keep the catalogue's (cheapest-first) order.
 */
export function teamSizeOptions(plans: readonly CappedPlan[]): TeamSizeOption[] {
  const sorted = [...plans].sort(
    (a, b) => (a.staffCap ?? Number.POSITIVE_INFINITY) - (b.staffCap ?? Number.POSITIVE_INFINITY),
  );
  const options: TeamSizeOption[] = [];
  let previous = 0;
  for (const plan of sorted) {
    const max = plan.staffCap;
    if (max !== null && max <= previous) continue;
    options.push({ planKey: plan.key, min: previous + 1, max });
    if (max === null) break;
    previous = max;
  }
  return options;
}

/**
 * The plan picked on the landing page allows fewer staff than the answer: worth a soft
 * note (the pick still wins; the staff cap is enforced once the trial ends).
 */
export function pickBelowTeamSize(
  plans: readonly CappedPlan[],
  pickedKey: string | null,
  answer: TeamSizeOption | null,
): CappedPlan | null {
  if (!pickedKey || !answer) return null;
  const picked = plans.find((p) => p.key === pickedKey);
  if (!picked || picked.staffCap === null) return null;
  return picked.staffCap < answer.min ? picked : null;
}
