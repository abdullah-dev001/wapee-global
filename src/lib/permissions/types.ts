import { type PermissionKey } from '@/config/permissions';
import { type FeatureMap } from '@/features/plans/featureLogic';
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
   * `my_features().features` from the server: which plan / add-on features are on.
   * **`null` = not known yet (loading or failed): every gated feature is OFF.**
   * A trial arrives with everything on; the database decides, not the client.
   */
  features: FeatureMap | null;
  /** Platform flag: a super admin passes every check. */
  isSuperAdmin: boolean;
};

export type { PermissionKey };
