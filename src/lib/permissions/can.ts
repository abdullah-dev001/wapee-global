import { permissionMeta, planAtLeast, type Addon, type PermissionKey } from '@/config/permissions';

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

/** Which add-ons are switched on. Phase 8 fills this from `business_addons`. */
export type AddonState = Partial<Record<Addon, boolean>>;

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
 * Is `feature` available on this business's plan and add-ons?
 *
 * A feature here is a permission key: its `minPlan` and `addon` come from the
 * catalogue. Plan tiers are real today (`businesses.plan`); add-ons have no
 * table until Phase 8, so an unknown add-on counts as ON.
 *
 * A business with no plan is on trial and sees everything (product doc §10).
 */
export function hasFeature(
  set: Pick<GrantSet, 'plan' | 'isSuperAdmin'>,
  permission: PermissionKey,
  addons: AddonState = {},
): boolean {
  if (set.isSuperAdmin) return true;

  const meta = permissionMeta(permission);
  // No plan assigned yet = trial, which includes everything (product doc §10).
  if (meta.minPlan && set.plan !== null && !planAtLeast(set.plan, meta.minPlan)) return false;
  // TODO(phase 8): read `business_addons`. Until that table exists an add-on is
  // treated as switched on, so add-on screens are gated by permission only.
  if (meta.addon && addons[meta.addon] === false) return false;
  return true;
}

/**
 * The everyday check: the business must be usable, the plan must include the
 * feature, and the member must hold the permission. Mirrors SQL `can()` plus the
 * plan layer the database does not carry yet.
 *
 * An inactive business (ended trial) fails everything except the permissions in
 * `ALWAYS_ALLOWED_WHEN_INACTIVE` — billing has to stay reachable or the owner
 * could never pay (product doc §10).
 */
export function can(
  set: GrantSet,
  permission: PermissionKey,
  branchId: string | null = null,
  addons: AddonState = {},
): boolean {
  if (set.isSuperAdmin) return true;
  if (!set.isActive && !ALWAYS_ALLOWED_WHEN_INACTIVE.has(permission)) return false;
  if (!hasFeature(set, permission, addons)) return false;
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
