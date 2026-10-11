/**
 * Plan refusals coming from the database, mapped to calm, specific messages.
 *
 * Triggers raise (staff cap, branch limit, custom roles); RPCs return
 * `{ok:false, code:'feature_unavailable'}`. Both land here. The map is typed so a
 * missing translation is a compile error.
 */

export const PLAN_ERROR_KEYS = {
  staff_cap_reached: 'plans.errors.staffCapReached',
  branch_limit_reached: 'plans.errors.branchLimitReached',
  feature_unavailable: 'plans.errors.featureUnavailable',
  custom_roles_unavailable: 'plans.errors.customRolesUnavailable',
} as const;

export type PlanErrorCode = keyof typeof PLAN_ERROR_KEYS;
export type PlanErrorKey = (typeof PLAN_ERROR_KEYS)[PlanErrorCode];

function textOf(error: unknown): { message: string; details: string } {
  if (typeof error === 'string') return { message: error, details: '' };
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: unknown; details?: unknown; code?: unknown };
    return {
      message: typeof e.message === 'string' ? e.message : typeof e.code === 'string' ? e.code : '',
      details: typeof e.details === 'string' ? e.details : '',
    };
  }
  return { message: '', details: '' };
}

/**
 * Which plan refusal is this, if any? Accepts a Postgrest error, an Error, a
 * plain code string, or an RPC result like `{code, feature}`.
 */
export function planErrorCode(error: unknown): PlanErrorCode | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const e = error as { code?: unknown; feature?: unknown };
    if (e.code === 'feature_unavailable') {
      return e.feature === 'custom_roles' ? 'custom_roles_unavailable' : 'feature_unavailable';
    }
  }
  const { message, details } = textOf(error);
  if (message.includes('staff_cap_reached')) return 'staff_cap_reached';
  if (message.includes('branch_limit_reached')) return 'branch_limit_reached';
  if (message.includes('feature_unavailable')) {
    return details.includes('custom_roles') ? 'custom_roles_unavailable' : 'feature_unavailable';
  }
  return null;
}

export function planErrorKey(error: unknown): PlanErrorKey | null {
  const code = planErrorCode(error);
  return code ? PLAN_ERROR_KEYS[code] : null;
}
