import { type PermissionKey } from '@/config/permissions';

import { type FeatureKey, isFeatureOn } from '@/features/plans/featureLogic';

import { can, hasFeature, hasPermission } from './can';
import { useGrantSet } from './useGrants';

/**
 * UI gating hooks (CLAUDE.md §7). They hide and disable; they never authorise.
 * Every action they guard is checked again by RLS and by the RPC / Edge Function.
 */

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

  const allowed = can(set, permission, targetBranch);
  const held = hasPermission(set, permission, targetBranch);

  return {
    allowed,
    isPending: false,
    // Only report a plan block when the member would otherwise be allowed,
    // so an upgrade prompt never shows to someone who lacks the permission.
    blockedByPlan: !allowed && held && !hasFeature(set, permission),
    blockedByTrial: !allowed && held && !set.isActive,
  };
}

/**
 * `useFeature('commission.view_all')` — plan and add-on gating only, ignoring
 * whether the member holds the permission. Use it for upgrade prompts and for
 * hiding a whole module.
 *
 * Reads the server's `my_features()` answer; unknown (loading / failed) means off.
 */
export function useFeature(permission: PermissionKey): {
  enabled: boolean;
  isPending: boolean;
} {
  const { set, isPending } = useGrantSet();
  if (isPending) return { enabled: false, isPending: true };
  return { enabled: hasFeature(set, permission), isPending: false };
}

/**
 * `useFeatureFlag('embed_widget')` — is a plan / add-on feature on for the current
 * business? For screens and settings that are gated by a feature rather than by a
 * permission. Hides and explains; the RPCs and triggers refuse regardless.
 */
export function useFeatureFlag(key: FeatureKey): { enabled: boolean; isPending: boolean } {
  const { set, isPending } = useGrantSet();
  if (isPending) return { enabled: false, isPending: true };
  return { enabled: set.isSuperAdmin || isFeatureOn(set.features, key), isPending: false };
}
