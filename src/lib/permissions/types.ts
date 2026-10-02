import { type PermissionKey } from '@/config/permissions';
import { type Database } from '@/lib/supabase/database.types';

/** own / branch / all (product doc §9). */
export type PermissionScope = Database['public']['Enums']['permission_scope'];

/**
 * One row of `my_grants()`: a permission the signed-in member holds, the scope it
 * was granted at, and the branch the role is assigned to (`null` = every branch).
 */
export type Grant = {
  permission: string;
  scope: PermissionScope;
  branchId: string | null;
};

/** The caller's whole permission set for one business, as the UI caches it. */
export type GrantSet = {
  businessId: string;
  grants: readonly Grant[];
  /** `business_is_active()`: false once a trial has ended (product doc §10). */
  isActive: boolean;
  /**
   * The business plan, for `minPlan` gating.
   *
   * **`null` means no plan is assigned yet**, which is the normal state during
   * the 14-day trial — the super admin assigns a plan manually (product doc §10).
   * A trial must show every feature, so `null` passes plan gating rather than
   * being treated as the cheapest tier.
   */
  plan: Database['public']['Enums']['business_plan'] | null;
  /** Platform flag: a super admin passes every check. */
  isSuperAdmin: boolean;
};

export type { PermissionKey };
