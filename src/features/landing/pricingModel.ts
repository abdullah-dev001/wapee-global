/**
 * Landing-page pricing model. Pure, NO imports: the build script inlines this file
 * (types stripped) into the page's browser script, and vitest imports it directly.
 *
 * Every number shown on the page comes from `get_public_pricing()` (the same
 * `plans` / `addons` rows /admin/platform edits). Plan features are the SAME flags
 * `business_has_feature()` gates on, so the page cannot promise more than a plan unlocks.
 */

export type Period = 'monthly' | 'yearly';

export type PublicPlan = {
  key: string;
  name: string;
  /** Per location; null = unlimited. */
  staffCap: number | null;
  /** Null = unlimited. */
  maxBranches: number | null;
  perBranch: boolean;
  features: Record<string, boolean>;
  monthlyMinor: number;
  annualMinor: number;
  currency: string;
};

export type PublicAddon = {
  key: string;
  name: string;
  /** Plan keys it can be bought on; null = every plan. */
  availablePlans: string[] | null;
  monthlyMinor: number;
  annualMinor: number;
  currency: string;
};

export type PublicPricing = { plans: PublicPlan[]; addons: PublicAddon[] };

/**
 * Plan feature flags shown on the page, in display order. `embed_widget` is a real
 * flag but the widget is OFF at launch, so it is deliberately not listed.
 */
export const DISPLAY_FEATURES = [
  'booking_link',
  'core',
  'website',
  'reviews',
  'default_roles',
  'commission',
  'advanced_reports',
  'custom_roles',
  'multi_branch',
  'branch_comparison',
] as const;
export type DisplayFeature = (typeof DISPLAY_FEATURES)[number];

/** Features that exist in the data but must never be advertised at launch. */
export const HIDDEN_FEATURES: readonly string[] = ['embed_widget'];

/** The plan highlighted as "Most popular". */
export const POPULAR_PLAN = 'team';

// ---------------------------------------------------------------------------
// Parsing (defensive: anything malformed is dropped; no plans = unusable)
// ---------------------------------------------------------------------------
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function minor(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}
function countOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
}
function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}
function currencyCode(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : null;
}

function parsePlan(raw: unknown): PublicPlan | null {
  if (!isRecord(raw)) return null;
  const key = text(raw.key);
  const name = text(raw.name);
  const monthlyMinor = minor(raw.price_monthly_minor);
  const annualMinor = minor(raw.price_annual_minor);
  const currency = currencyCode(raw.currency);
  if (!key || !name || monthlyMinor === null || annualMinor === null || !currency) return null;
  const features: Record<string, boolean> = {};
  if (isRecord(raw.features)) {
    for (const [k, v] of Object.entries(raw.features)) if (typeof v === 'boolean') features[k] = v;
  }
  return {
    key,
    name,
    staffCap: countOrNull(raw.staff_cap),
    maxBranches: countOrNull(raw.max_branches),
    perBranch: raw.priced_per_branch === true,
    features,
    monthlyMinor,
    annualMinor,
    currency,
  };
}

function parseAddon(raw: unknown): PublicAddon | null {
  if (!isRecord(raw)) return null;
  const key = text(raw.key);
  const name = text(raw.name);
  const monthlyMinor = minor(raw.price_monthly_minor);
  const annualMinor = minor(raw.price_annual_minor);
  const currency = currencyCode(raw.currency);
  if (!key || !name || monthlyMinor === null || annualMinor === null || !currency) return null;
  const plans = Array.isArray(raw.available_plans)
    ? raw.available_plans.filter((p): p is string => typeof p === 'string')
    : null;
  return {
    key,
    name,
    availablePlans: plans && plans.length > 0 ? plans : null,
    monthlyMinor,
    annualMinor,
    currency,
  };
}

/** `get_public_pricing()` payload, or null when it holds no usable plan. */
export function parsePublicPricing(raw: unknown): PublicPricing | null {
  if (!isRecord(raw) || !Array.isArray(raw.plans)) return null;
  const plans = raw.plans.map(parsePlan).filter((p): p is PublicPlan => p !== null);
  if (plans.length === 0) return null;
  const addons = Array.isArray(raw.addons)
    ? raw.addons.map(parseAddon).filter((a): a is PublicAddon => a !== null)
    : [];
  return { plans, addons };
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------
/** Digits after the decimal point for a currency (JPY 0, USD 2, KWD 3). */
export function currencyDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Currency-formatted amount; whole amounts drop the decimals (no ".00"). */
export function formatAmount(amountMinor: number, currency: string, locale: string): string {
  const digits = currencyDigits(currency);
  const major = amountMinor / 10 ** digits;
  const whole = Number.isInteger(major);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(major);
}

type Priced = { monthlyMinor: number; annualMinor: number };

/** The headline monthly amount for a period (yearly = annual spread over 12 months). */
export function perMonthMinor(item: Priced, period: Period): number {
  return period === 'monthly' ? item.monthlyMinor : Math.round(item.annualMinor / 12);
}

/**
 * Months free with yearly billing, when every plan gives the same whole number
 * (e.g. pay 10 x monthly = 2 months free). Null when it differs or is not positive.
 */
export function yearlyMonthsFree(plans: readonly Priced[]): number | null {
  let shared: number | null = null;
  for (const p of plans) {
    if (p.monthlyMinor <= 0) return null;
    const free = (p.monthlyMinor * 12 - p.annualMinor) / p.monthlyMinor;
    if (!Number.isInteger(free) || free <= 0) return null;
    if (shared !== null && shared !== free) return null;
    shared = free;
  }
  return shared;
}

// ---------------------------------------------------------------------------
// What each plan includes
// ---------------------------------------------------------------------------
export function hasFeature(plan: PublicPlan, key: string): boolean {
  return !HIDDEN_FEATURES.includes(key) && plan.features[key] === true;
}

/**
 * The checklist for a plan card: the first plan lists everything it includes; each
 * next plan says "Everything in <previous>" and lists only what it adds.
 */
export function planHighlights(
  plans: readonly PublicPlan[],
  index: number,
): { inheritsFrom: string | null; features: DisplayFeature[] } {
  const plan = plans[index];
  if (!plan) return { inheritsFrom: null, features: [] };
  const prev = index > 0 ? plans[index - 1] : undefined;
  const features = DISPLAY_FEATURES.filter(
    (k) => hasFeature(plan, k) && !(prev && hasFeature(prev, k)),
  );
  return { inheritsFrom: prev ? prev.name : null, features };
}

/** True when the add-on can be bought on this plan (and the plan does not already include it). */
export function addonOffered(addon: PublicAddon, plan: PublicPlan): boolean {
  if (hasFeature(plan, addon.key)) return false;
  return addon.availablePlans === null || addon.availablePlans.includes(plan.key);
}

export type CompareCell = 'yes' | 'no' | 'addon';
export type CompareRow = { key: string; label: string | null; cells: CompareCell[] };

/**
 * Compare-table rows. Feature rows use the display features (label = null: the page
 * looks up its own text); add-on rows use the add-on name from the data. A row that
 * no plan offers in any form is left out.
 */
export function compareRows(
  plans: readonly PublicPlan[],
  addons: readonly PublicAddon[],
): CompareRow[] {
  const byKey = new Map(addons.map((a) => [a.key, a]));
  const cell = (plan: PublicPlan, key: string): CompareCell => {
    if (hasFeature(plan, key)) return 'yes';
    const addon = byKey.get(key);
    return addon && addonOffered(addon, plan) ? 'addon' : 'no';
  };
  const rows: CompareRow[] = [];
  for (const key of DISPLAY_FEATURES) {
    const cells = plans.map((p) => cell(p, key));
    if (cells.some((c) => c !== 'no')) rows.push({ key, label: null, cells });
  }
  for (const addon of addons) {
    if ((DISPLAY_FEATURES as readonly string[]).includes(addon.key)) continue;
    const cells = plans.map((p) => cell(p, addon.key));
    if (cells.some((c) => c !== 'no')) rows.push({ key: addon.key, label: addon.name, cells });
  }
  return rows;
}

/** Names of the plans an add-on can be bought on (null = every plan) and that include it. */
export function addonAvailability(
  addon: PublicAddon,
  plans: readonly PublicPlan[],
): { onlyOn: string[] | null; includedIn: string[] } {
  const includedIn = plans.filter((p) => hasFeature(p, addon.key)).map((p) => p.name);
  if (addon.availablePlans === null) return { onlyOn: null, includedIn };
  const onlyOn = plans.filter((p) => addon.availablePlans?.includes(p.key)).map((p) => p.name);
  return { onlyOn, includedIn };
}

/** Replaces `{{name}}` placeholders. Values are inserted as-is (escape for HTML afterwards). */
export function interpolate(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
