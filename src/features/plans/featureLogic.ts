import { permissionMeta, type Addon, type PermissionKey } from '@/config/permissions';

/**
 * Plan / add-on gating, client side (Phase 8B).
 *
 * The database decides (`business_has_feature()`); the client only reads its
 * answer through `my_features()`. Nothing here recomputes a plan rule: it maps a
 * permission or a screen to a feature KEY and looks the key up in what the server
 * returned. While the answer is unknown (`null`) a gated feature is OFF.
 */

/** Feature keys the server can return (plan flags + add-on keys). */
export const FEATURE_KEYS = [
  'core',
  'website',
  'reviews',
  'booking_link',
  'default_roles',
  'commission',
  'embed_widget',
  'advanced_reports',
  'custom_roles',
  'multi_branch',
  'branch_comparison',
  'packages',
  'inventory',
  'files_photos',
  'forms_consent',
  'client_portal',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** The add-on keys (a business_addons row switches them on). */
export const ADDON_FEATURE_KEYS = [
  'packages',
  'inventory',
  'files_photos',
  'forms_consent',
  'client_portal',
  'custom_roles',
] as const satisfies readonly FeatureKey[];

export type FeatureMap = Partial<Record<FeatureKey, boolean>>;

export type PlanKey = 'solo' | 'team' | 'business';
export type SubscriptionStatus = 'trialing' | 'active' | 'inactive' | 'suspended';

/** `my_features()` parsed. */
export type PlanSnapshot = {
  /** Effective plan. During a trial this is `business`. Null: no plan (lapsed trial). */
  plan: PlanKey | null;
  status: SubscriptionStatus;
  trial: boolean;
  active: boolean;
  /** Per location. Null = unlimited. */
  staffCap: number | null;
  maxBranches: number | null;
  features: FeatureMap;
};

const PLANS: readonly string[] = ['solo', 'team', 'business'];
const STATUSES: readonly string[] = ['trialing', 'active', 'inactive', 'suspended'];

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Defensive parse of the RPC payload; anything malformed is "unknown" (null). */
export function parsePlanSnapshot(raw: unknown): PlanSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== 'string' || !STATUSES.includes(r.status)) return null;
  const featuresRaw = typeof r.features === 'object' && r.features !== null ? r.features : null;
  if (!featuresRaw) return null;

  const features: FeatureMap = {};
  for (const key of FEATURE_KEYS) {
    const value = (featuresRaw as Record<string, unknown>)[key];
    if (typeof value === 'boolean') features[key] = value;
  }
  return {
    plan: typeof r.plan === 'string' && PLANS.includes(r.plan) ? (r.plan as PlanKey) : null,
    status: r.status as SubscriptionStatus,
    trial: r.trial === true,
    active: r.active === true,
    staffCap: numberOrNull(r.staff_cap),
    maxBranches: numberOrNull(r.max_branches),
    features,
  };
}

/** Is `key` on? Unknown map (still loading / failed) means off. */
export function isFeatureOn(features: FeatureMap | null, key: FeatureKey): boolean {
  return features?.[key] === true;
}

const ADDON_FEATURE: Record<Addon, FeatureKey> = {
  packages: 'packages',
  inventory: 'inventory',
  files: 'files_photos',
  forms: 'forms_consent',
  portal: 'client_portal',
  custom_roles: 'custom_roles',
};

/**
 * The feature a permission depends on, or null when it needs neither plan nor
 * add-on. Mirrors the catalogue (`minPlan` / `addon`) so a new gated permission
 * only needs its catalogue entry.
 */
export function featureForPermission(permission: PermissionKey): FeatureKey | null {
  const meta = permissionMeta(permission);
  if (meta.addon) return ADDON_FEATURE[meta.addon];
  if (meta.minPlan) {
    if (permission.startsWith('commission.')) return 'commission';
    if (permission === 'reports.view_advanced') return 'advanced_reports';
  }
  return null;
}

/** A screen / area that is gated by a feature rather than by a permission. */
export const ROUTE_FEATURES: Readonly<Record<string, FeatureKey>> = {
  '/settings/widget': 'embed_widget',
};

export function featureForRoute(route: string): FeatureKey | null {
  return ROUTE_FEATURES[route] ?? null;
}

/** Share of the staff cap in use, for a usage bar. Null when unlimited. */
export function usageRatio(used: number, cap: number | null): number | null {
  if (cap === null || cap <= 0) return null;
  return Math.min(1, Math.max(0, used / cap));
}

/** True when one more person would be refused. */
export function isAtCap(used: number, cap: number | null): boolean {
  return cap !== null && used >= cap;
}

export const STATUS_KEYS = {
  trialing: 'plans.status.trialing',
  active: 'plans.status.active',
  inactive: 'plans.status.inactive',
  suspended: 'plans.status.suspended',
} as const;

/** i18n key for a subscription status, or null for an unknown value. */
export function statusKey(status: string): (typeof STATUS_KEYS)[SubscriptionStatus] | null {
  return Object.prototype.hasOwnProperty.call(STATUS_KEYS, status)
    ? STATUS_KEYS[status as SubscriptionStatus]
    : null;
}
