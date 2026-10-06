import { type LocalDate } from '@/lib/time';

/**
 * Pure rules for the commission screens (decided with the user, enforced by the
 * database: `commission_sync`, `set_commission_rule`):
 *  - the base is the invoice LINE net (price x qty minus its discount), TAX EXCLUDED
 *  - the rule is (staff, service), else that staff's default; a free-text line only
 *    ever uses a default PERCENT
 *  - earned only when the invoice is FULLY paid; credit notes reverse it in proportion
 */

export type RuleKind = 'percent' | 'flat' | 'none';

export type CommissionRule = {
  id: string;
  staffId: string;
  /** null = this staff member's default rule. */
  serviceId: string | null;
  kind: RuleKind;
  percentBp: number | null;
  flatMinor: number | null;
  currency: string | null;
  effectiveFrom: LocalDate;
  createdAt: string;
};

/**
 * The rule in force on `today` for one (staff, service) key: the latest
 * `effective_from <= today`, ties broken by creation time. Rules dated in the
 * future are not in force yet.
 */
export function currentRule(
  rules: readonly CommissionRule[],
  serviceId: string | null,
  today: LocalDate,
): CommissionRule | null {
  let best: CommissionRule | null = null;
  for (const rule of rules) {
    if (rule.serviceId !== serviceId || rule.effectiveFrom > today) continue;
    if (
      !best ||
      rule.effectiveFrom > best.effectiveFrom ||
      (rule.effectiveFrom === best.effectiveFrom && rule.createdAt > best.createdAt)
    ) {
      best = rule;
    }
  }
  return best;
}

/** The next rule that takes effect after today for a key (to show "starts on ..."). */
export function upcomingRule(
  rules: readonly CommissionRule[],
  serviceId: string | null,
  today: LocalDate,
): CommissionRule | null {
  const future = rules
    .filter((rule) => rule.serviceId === serviceId && rule.effectiveFrom > today)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  return future[0] ?? null;
}

export type SetRuleInput =
  | { kind: 'percent'; percentBp: number }
  | { kind: 'flat'; flatMinor: number; currency: string }
  | { kind: 'none' };

export function ruleInputProblem(input: SetRuleInput): 'percent' | 'flat' | null {
  if (input.kind === 'percent') {
    return Number.isInteger(input.percentBp) && input.percentBp >= 0 && input.percentBp <= 10000
      ? null
      : 'percent';
  }
  if (input.kind === 'flat') {
    return Number.isInteger(input.flatMinor) &&
      input.flatMinor >= 0 &&
      input.flatMinor <= 100_000_000_000 &&
      /^[A-Z]{3}$/.test(input.currency)
      ? null
      : 'flat';
  }
  return null;
}

/** Valid "YYYY-MM-DD" within the range the database accepts (2020-01-01 .. a year ahead). */
export function isValidEffectiveFrom(value: string, today: LocalDate): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== value) return false;
  return value >= '2020-01-01' && t <= Date.parse(`${today}T00:00:00Z`) + 366 * 86_400_000;
}

export type ReportRow = {
  staffId: string;
  staffName: string;
  currency: string;
  earnedMinor: number;
  reversedMinor: number;
  netMinor: number;
  invoiceCount: number;
};

/** Group rows by staff, keeping each currency separate (never added together). */
export function groupByStaff(
  rows: readonly ReportRow[],
): { staffId: string; staffName: string; rows: ReportRow[] }[] {
  const map = new Map<string, { staffId: string; staffName: string; rows: ReportRow[] }>();
  for (const row of rows) {
    const entry = map.get(row.staffId) ?? {
      staffId: row.staffId,
      staffName: row.staffName,
      rows: [],
    };
    entry.rows.push(row);
    map.set(row.staffId, entry);
  }
  return [...map.values()]
    .map((entry) => ({
      ...entry,
      rows: entry.rows.sort((a, b) => a.currency.localeCompare(b.currency)),
    }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
}

export const COMMISSION_ERROR_KEYS = {
  forbidden: 'commission.errors.forbidden',
  feature_unavailable: 'commission.errors.feature_unavailable',
  not_found: 'commission.errors.not_found',
  invalid_kind: 'commission.errors.invalid_kind',
  invalid_percent: 'commission.errors.invalid_percent',
  invalid_flat: 'commission.errors.invalid_flat',
  unknown_service: 'commission.errors.unknown_service',
  invalid_date: 'commission.errors.invalid_date',
  invalid_range: 'commission.errors.invalid_range',
  range_too_large: 'commission.errors.range_too_large',
  invalid_branch: 'commission.errors.invalid_branch',
  unknown: 'commission.errors.unknown',
} as const;

export type CommissionErrorCode = keyof typeof COMMISSION_ERROR_KEYS;

export function commissionErrorKey(
  code: string | null,
): (typeof COMMISSION_ERROR_KEYS)[CommissionErrorCode] {
  if (code && Object.prototype.hasOwnProperty.call(COMMISSION_ERROR_KEYS, code)) {
    return COMMISSION_ERROR_KEYS[code as CommissionErrorCode];
  }
  return COMMISSION_ERROR_KEYS.unknown;
}

export const ENTRY_REASON_KEYS = {
  paid: 'commission.reason.paid',
  credit_note: 'commission.reason.credit_note',
  unpaid: 'commission.reason.unpaid',
} as const;

export function entryReasonKey(
  reason: string,
): (typeof ENTRY_REASON_KEYS)[keyof typeof ENTRY_REASON_KEYS] {
  return Object.prototype.hasOwnProperty.call(ENTRY_REASON_KEYS, reason)
    ? ENTRY_REASON_KEYS[reason as keyof typeof ENTRY_REASON_KEYS]
    : ENTRY_REASON_KEYS.paid;
}
