import { type PermissionKey } from '@/config/permissions';
import { featureForPermission, isFeatureOn } from '@/features/plans/featureLogic';

import { type GrantSet } from './types';

/**
 * Pure permission logic. No hooks, no network — so it can be reused in a loop,
 * in a mutation callback, or in a test.
 *
 * It mirrors the database exactly:
 * - `hasPermission()` mirrors SQL `has_permission(business, branch, perm)`
 * - `can()` mirrors SQL `can(...)` = `business_is_active()` AND `has_permission()`
 *
 * **The database is still the boundary** (CLAUDE.md §7). If these ever disagree,
 * the request fails at RLS and the UI was merely wrong about what to show.
 */

/**
 * Does the member hold `permission`, honouring scope and branch?
 *
 * Scope rules, copied from `has_permission`:
 * - `all` ignores the branch entirely
 * - a role assigned to every branch (`branchId === null`) covers any branch
 * - a branch-scoped role matches only its own branch
 *
 * Passing `branchId: null` asks "anywhere", which is what a nav item wants.
 */
export function hasPermission(
  set: Pick<GrantSet, 'grants' | 'isSuperAdmin'>,
  permission: PermissionKey,
  branchId: string | null = null,
): boolean {
  if (set.isSuperAdmin) return true;

  return set.grants.some((grant) => {
    if (grant.permission !== permission) return false;
    if (grant.scope === 'all') return true;
    if (grant.branchId === null) return true;
    // "Anywhere" question: any branch assignment answers it.
    if (branchId === null) return true;
    return grant.branchId === branchId;
  });
}

/**
 * Is the plan / add-on feature behind `permission` on for this business?
 *
 * The answer is the server's (`my_features()`), keyed through the catalogue
 * (`featureForPermission`). A permission that needs neither plan nor add-on is
 * always available; while the feature map is unknown a gated one is OFF.
 */
export function hasFeature(
  set: Pick<GrantSet, 'features' | 'isSuperAdmin'>,
  permission: PermissionKey,
): boolean {
  if (set.isSuperAdmin) return true;
  const feature = featureForPermission(permission);
  return feature === null || isFeatureOn(set.features, feature);
}

/**
 * The everyday check: the business must be usable, the plan must include the
 * feature, and the member must hold the permission. Mirrors SQL `can()` plus the
 * plan layer (`business_has_feature`, read through `my_features()`).
 *
 * An inactive business (ended trial) fails everything except the permissions in
 * `ALWAYS_ALLOWED_WHEN_INACTIVE` — billing has to stay reachable or the owner
 * could never pay (product doc §10).
 */
export function can(
  set: GrantSet,
  permission: PermissionKey,
  branchId: string | null = null,
): boolean {
  if (set.isSuperAdmin) return true;
  if (!set.isActive && !ALWAYS_ALLOWED_WHEN_INACTIVE.has(permission)) return false;
  if (!hasFeature(set, permission)) return false;
  return hasPermission(set, permission, branchId);
}

/**
 * Still reachable while the business is inactive, so a locked-out owner can see
 * what happened and pay. Matches the `businesses` RLS policies, which are
 * deliberately not gated on `business_is_active()`.
 */
export const ALWAYS_ALLOWED_WHEN_INACTIVE: ReadonlySet<PermissionKey> = new Set([
  'settings.business',
  'settings.billing',
]);
