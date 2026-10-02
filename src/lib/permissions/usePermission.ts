import { type PermissionKey } from '@/config/permissions';

import { can, hasFeature, hasPermission, type AddonState } from './can';
import { useGrantSet } from './useGrants';

/**
 * UI gating hooks (CLAUDE.md §7). They hide and disable; they never authorise.
 * Every action they guard is checked again by RLS and by the RPC / Edge Function.
 */

/** Add-ons switched on for the business. Phase 8 replaces this with a query. */
const NO_ADDON_STATE: AddonState = {};

export type PermissionResult = {
  /** Allowed. False while loading, so nothing appears before the answer is known. */
  allowed: boolean;
  /** Still loading the permission set. Use it to show a skeleton instead of "denied". */
  isPending: boolean;
  /** Denied specifically because the plan or add-on does not include it. */
  blockedByPlan: boolean;
  /** Denied specifically because the business is inactive (trial over). */
  blockedByTrial: boolean;
};

/**
 * `usePermission('invoices.discount')` — the full check: business active, plan
 * includes it, permission held in the current branch.
 *
 * Pass a branch id to ask about a specific branch; the default asks "anywhere",
 * which is what a menu item or a route guard wants.
 */
export function usePermission(
  permission: PermissionKey,
  branchId?: string | null,
): PermissionResult {
  const { set, isPending } = useGrantSet();
  const targetBranch = branchId === undefined ? null : branchId;

  if (isPending) {
    return { allowed: false, isPending: true, blockedByPlan: false, blockedByTrial: false };
  }

  const allowed = can(set, permission, targetBranch, NO_ADDON_STATE);
  const held = hasPermission(set, permission, targetBranch);

  return {
    allowed,
    isPending: false,
    // Only report a plan block when the member would otherwise be allowed,
    // so an upgrade prompt never shows to someone who lacks the permission.
    blockedByPlan: !allowed && held && !hasFeature(set, permission, NO_ADDON_STATE),
    blockedByTrial: !allowed && held && !set.isActive,
  };
}

/**
 * `useFeature('commission.view_all')` — plan and add-on gating only, ignoring
 * whether the member holds the permission. Use it for upgrade prompts and for
 * hiding a whole module.
 *
 * Plan tiers are enforced for real (`businesses.plan`). Add-ons have no table
 * until Phase 8 and count as switched on.
 */
export function useFeature(permission: PermissionKey): {
  enabled: boolean;
  isPending: boolean;
} {
  const { set, isPending } = useGrantSet();
  if (isPending) return { enabled: false, isPending: true };
  return { enabled: hasFeature(set, permission, NO_ADDON_STATE), isPending: false };
}
