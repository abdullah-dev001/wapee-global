import { type PermissionScope } from '@/lib/permissions/types';

/**
 * Pure rules for the branches (locations) screens. The database decides every
 * one of them (`update_branch`, `archive_branch`, the lock triggers); this module
 * parses input, builds the minimal patch and maps the refusal codes.
 */

export type BranchRow = {
  id: string;
  name: string;
  isPrimary: boolean;
  archived: boolean;
  countryCode: string;
  currency: string;
  timezone: string;
  address: string | null;
  phone: string | null;
  taxNumber: string | null;
  taxRateBp: number;
  invoicePrefix: string;
  /** > 1 once an invoice number has been issued: the prefix is then locked. */
  invoiceNextNo: number;
};

export type BranchFormValues = {
  name: string;
  countryCode: string;
  currency: string;
  timezone: string;
  address: string;
  phone: string;
  taxNumber: string;
  /** Percent as typed ("20", "7.5"); stored as basis points. */
  taxRatePercent: string;
  invoicePrefix: string;
};

/** "20" -> 2000, "7.5" -> 750, "" -> 0. Null when it is not a valid 0-100 percentage. */
export function parsePercentToBp(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (cleaned === '') return 0;
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(cleaned)) return null;
  const bp = Math.round(Number(cleaned) * 100);
  return bp >= 0 && bp <= 10000 ? bp : null;
}

export function bpToPercentText(bp: number): string {
  const percent = bp / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0$/, '');
}

export function formValuesFromBranch(branch: BranchRow): BranchFormValues {
  return {
    name: branch.name,
    countryCode: branch.countryCode,
    currency: branch.currency,
    timezone: branch.timezone,
    address: branch.address ?? '',
    phone: branch.phone ?? '',
    taxNumber: branch.taxNumber ?? '',
    taxRatePercent: bpToPercentText(branch.taxRateBp),
    invoicePrefix: branch.invoicePrefix,
  };
}

export type BranchPatch = Record<string, string | number | null>;

/**
 * Only what changed, in the shape `update_branch` takes. An emptied optional text
 * becomes null (the RPC clears the field). Returns null when nothing changed.
 */
export function buildBranchPatch(branch: BranchRow, values: BranchFormValues): BranchPatch | null {
  const patch: BranchPatch = {};
  const text = (a: string | null, b: string) => (a ?? '') !== b.trim();
  if (values.name.trim() !== branch.name) patch.name = values.name.trim();
  if (values.countryCode !== branch.countryCode) patch.country_code = values.countryCode;
  if (values.currency !== branch.currency) patch.currency = values.currency;
  if (values.timezone !== branch.timezone) patch.timezone = values.timezone;
  if (text(branch.address, values.address)) patch.address = values.address.trim() || null;
  if (text(branch.phone, values.phone)) patch.phone = values.phone.trim() || null;
  if (text(branch.taxNumber, values.taxNumber)) patch.tax_number = values.taxNumber.trim() || null;
  const bp = parsePercentToBp(values.taxRatePercent);
  if (bp !== null && bp !== branch.taxRateBp) patch.tax_rate_bp = bp;
  const prefix = values.invoicePrefix.trim().toUpperCase();
  if (prefix !== branch.invoicePrefix) patch.invoice_prefix = prefix;
  return Object.keys(patch).length === 0 ? null : patch;
}

export const PREFIX_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,9}$/;

export function isValidPrefix(value: string): boolean {
  return PREFIX_PATTERN.test(value.trim().toUpperCase());
}

export function prefixLocked(branch: Pick<BranchRow, 'invoiceNextNo'>): boolean {
  return branch.invoiceNextNo > 1;
}

/** Roles shown per branch in the switcher (keys only; labels are translated by the screen). */
export type MyBranch = {
  id: string;
  name: string;
  isPrimary: boolean;
  archived: boolean;
  countryCode: string;
  currency: string;
  timezone: string;
  roles: string[];
};

/** Does the switcher need to exist at all? Only with more than one place to switch to. */
export function showSwitcher(branches: readonly Pick<MyBranch, 'archived'>[]): boolean {
  return branches.filter((branch) => !branch.archived).length > 1;
}

/** The selected branch if it is still usable, else the primary, else the first. */
export function resolveSelectedBranch(
  branches: readonly MyBranch[],
  selectedId: string | null,
): string | null {
  const live = branches.filter((branch) => !branch.archived);
  if (live.some((branch) => branch.id === selectedId)) return selectedId;
  return (live.find((branch) => branch.isPrimary) ?? live[0])?.id ?? null;
}

export type CurrencyTotal = {
  currency: string;
  netRevenueMinor: number;
  collectedMinor: number;
  invoiceCount: number;
  branches: number;
};

/** Stable order: alphabetical by currency code. Totals are NEVER merged across currencies. */
export function sortCurrencyTotals<T extends { currency: string }>(totals: readonly T[]): T[] {
  return [...totals].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Add rows that share a currency; rows in different currencies stay separate.
 * (The server already returns per-currency totals; this is for any client-side
 * grouping and is tested so a future caller cannot "just add them up".)
 */
export function totalsByCurrency(
  rows: readonly {
    currency: string;
    netRevenueMinor: number;
    collectedMinor: number;
    invoiceCount: number;
  }[],
): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const row of rows) {
    const current = map.get(row.currency) ?? {
      currency: row.currency,
      netRevenueMinor: 0,
      collectedMinor: 0,
      invoiceCount: 0,
      branches: 0,
    };
    current.netRevenueMinor += row.netRevenueMinor;
    current.collectedMinor += row.collectedMinor;
    current.invoiceCount += row.invoiceCount;
    current.branches += 1;
    map.set(row.currency, current);
  }
  return sortCurrencyTotals([...map.values()]);
}

export const BRANCH_ERROR_KEYS = {
  forbidden: 'branches.errors.forbidden',
  feature_unavailable: 'branches.errors.feature_unavailable',
  branch_limit_reached: 'branches.errors.branch_limit_reached',
  not_found: 'branches.errors.not_found',
  invalid_name: 'branches.errors.invalid_name',
  name_taken: 'branches.errors.name_taken',
  invalid_country: 'branches.errors.invalid_country',
  invalid_currency: 'branches.errors.invalid_currency',
  invalid_timezone: 'branches.errors.invalid_timezone',
  invalid_tax_rate: 'branches.errors.invalid_tax_rate',
  invalid_prefix: 'branches.errors.invalid_prefix',
  prefix_taken: 'branches.errors.prefix_taken',
  prefix_locked: 'branches.errors.prefix_locked',
  currency_locked: 'branches.errors.currency_locked',
  currency_in_use: 'branches.errors.currency_in_use',
  timezone_in_use: 'branches.errors.timezone_in_use',
  invalid_branch: 'branches.errors.invalid_branch',
  unknown_field: 'branches.errors.unknown',
  nothing_to_change: 'branches.errors.nothing_to_change',
  primary_branch: 'branches.errors.primary_branch',
  last_branch: 'branches.errors.last_branch',
  future_appointments: 'branches.errors.future_appointments',
  open_drafts: 'branches.errors.open_drafts',
  website_uses_branch: 'branches.errors.website_uses_branch',
  staff_cap_reached: 'branches.errors.staff_cap_reached',
  invalid_range: 'branches.errors.invalid_range',
  range_too_large: 'branches.errors.range_too_large',
  unknown: 'branches.errors.unknown',
} as const;

export type BranchErrorCode = keyof typeof BRANCH_ERROR_KEYS;

export function branchErrorKey(code: string | null): (typeof BRANCH_ERROR_KEYS)[BranchErrorCode] {
  if (code && Object.prototype.hasOwnProperty.call(BRANCH_ERROR_KEYS, code)) {
    return BRANCH_ERROR_KEYS[code as BranchErrorCode];
  }
  return BRANCH_ERROR_KEYS.unknown;
}

export type { PermissionScope };
