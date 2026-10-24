/**
 * The plan a visitor picked before they had an account (a landing pricing button,
 * `?plan=team&interval=year`) or that onboarding suggested from their team size.
 * It only PRESELECTS a card on the Billing screen: it never assigns a plan, never
 * starts a checkout, and the server validates every real billing action again.
 *
 * Pure (no storage, no React) so it is unit-tested directly; `planIntentStore.ts`
 * does the browser storage.
 */

export type PlanIntervalChoice = 'month' | 'year';

export type PlanIntentSource = 'link' | 'team_size';

export type PlanIntent = {
  plan: string;
  interval: PlanIntervalChoice;
  source: PlanIntentSource;
  /** Epoch ms. */
  savedAt: number;
};

/** Long enough to outlast the 14-day trial and its grace, short enough to go stale. */
export const PLAN_INTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Shape only. Whether the key is a real, active plan is decided where it is used. */
const PLAN_KEY = /^[a-z][a-z0-9_]{0,31}$/;

function isInterval(value: unknown): value is PlanIntervalChoice {
  return value === 'month' || value === 'year';
}

/**
 * Reads `plan` / `interval` from a query string. A malformed plan means "no choice";
 * a missing or unknown interval falls back to monthly (the screen's own default).
 */
export function parsePlanParams(
  search: string,
): { plan: string; interval: PlanIntervalChoice } | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const plan = params.get('plan');
  if (plan === null || !PLAN_KEY.test(plan)) return null;
  const interval = params.get('interval');
  return { plan, interval: isInterval(interval) ? interval : 'month' };
}

/** The stored JSON back into an intent, or null when malformed or older than the TTL. */
export function parseStoredIntent(raw: string | null, now: number): PlanIntent | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.plan !== 'string' || !PLAN_KEY.test(v.plan)) return null;
  if (!isInterval(v.interval)) return null;
  if (v.source !== 'link' && v.source !== 'team_size') return null;
  if (typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt)) return null;
  if (v.savedAt > now || now - v.savedAt > PLAN_INTENT_TTL_MS) return null;
  return { plan: v.plan, interval: v.interval, source: v.source, savedAt: v.savedAt };
}

/** `?plan=…&interval=…`, to carry the choice through an email link (another tab or device). */
export function planIntentQuery(intent: Pick<PlanIntent, 'plan' | 'interval'> | null): string {
  if (!intent) return '';
  const params = new URLSearchParams({ plan: intent.plan, interval: intent.interval });
  return `?${params.toString()}`;
}

/** The intent's plan when it is one of the plans on sale now; otherwise nothing is preselected. */
export function intentPlanKey(
  intent: PlanIntent | null,
  plans: readonly { key: string }[],
): string | null {
  if (!intent) return null;
  return plans.some((p) => p.key === intent.plan) ? intent.plan : null;
}
