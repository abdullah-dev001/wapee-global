import { launch } from '@/config/launch';
import { PERMISSIONS, type PermissionKey } from '@/config/permissions';
import { type Grant, type PermissionScope } from '@/lib/permissions/types';

import { AREA_LABEL_KEYS, type PermissionArea } from './permissionLabels';

/**
 * Pure rules for the roles screen. The database enforces every one of them
 * (`can_define_at`, the role triggers, `settings.billing` owner-only); this module
 * only keeps the UI from OFFERING what would be refused, so nobody is shown a
 * choice that ends in an error.
 */

/** A matrix cell: no access, or one of the three scopes. */
export type ScopeChoice = 'none' | PermissionScope;

export const SCOPE_CHOICES: readonly ScopeChoice[] = ['none', 'own', 'branch', 'all'];

const RANK: Record<ScopeChoice, number> = { none: 0, own: 1, branch: 2, all: 3 };

export function scopeRank(scope: ScopeChoice): number {
  return RANK[scope];
}

/** Permissions that can never be part of a custom role (Owner-only). */
export const OWNER_ONLY_PERMISSIONS: readonly PermissionKey[] = ['settings.billing'];

export function isOwnerOnly(permission: PermissionKey): boolean {
  return OWNER_ONLY_PERMISSIONS.includes(permission);
}

/** Permissions of a feature that is switched OFF at launch (`config/launch.ts`). */
const SMS_PERMISSIONS: readonly PermissionKey[] = ['sms.send', 'sms.buy_credits'];

/**
 * True when the matrix must not offer this permission because no screen uses it
 * at launch (SMS is off). Hidden, not removed: a role's stored value is left
 * untouched, so saving a role never drops it and it returns when the flag flips.
 */
export function isLaunchHidden(
  permission: PermissionKey,
  flags: { sms: boolean } = launch,
): boolean {
  return !flags.sms && SMS_PERMISSIONS.includes(permission);
}

/** The highest scope the CALLER holds a permission at, anywhere (0 = not at all). */
export function heldRank(
  grants: readonly Grant[],
  permission: PermissionKey,
  isSuperAdmin = false,
): number {
  if (isSuperAdmin) return RANK.all;
  let best = 0;
  for (const grant of grants) {
    if (grant.permission === permission) best = Math.max(best, RANK[grant.scope]);
  }
  return best;
}

/**
 * The scopes the editor may pick for one permission: "none" always (taking
 * something away is always allowed), anything up to what the caller holds, and the
 * role's CURRENT value even if it is above that (so an untouched higher
 * permission stays selectable and is not silently lowered). Owner-only
 * permissions offer "none" only.
 */
export function allowedScopes(
  held: number,
  current: ScopeChoice,
  permission: PermissionKey,
): ScopeChoice[] {
  if (isOwnerOnly(permission)) return ['none'];
  return SCOPE_CHOICES.filter(
    (choice) => choice === 'none' || RANK[choice] <= held || choice === current,
  );
}

export type PermissionRow = { permission: string; scope: PermissionScope };
export type RoleDraft = Partial<Record<PermissionKey, PermissionScope>>;

const KNOWN = new Set<string>(Object.keys(PERMISSIONS));

export function isPermissionKey(value: string): value is PermissionKey {
  return KNOWN.has(value);
}

export function draftFromRows(rows: readonly PermissionRow[]): RoleDraft {
  const draft: RoleDraft = {};
  for (const row of rows) {
    if (isPermissionKey(row.permission)) draft[row.permission] = row.scope;
  }
  return draft;
}

/** The RPC payload: only granted permissions, in a stable order. */
export function draftToPayload(draft: RoleDraft): PermissionRow[] {
  return (Object.keys(draft) as PermissionKey[]).sort().flatMap((permission) => {
    const scope = draft[permission];
    return scope ? [{ permission, scope }] : [];
  });
}

export function setScope(
  draft: RoleDraft,
  permission: PermissionKey,
  choice: ScopeChoice,
): RoleDraft {
  const rest = Object.fromEntries(Object.entries(draft).filter(([key]) => key !== permission));
  return choice === 'none' ? rest : { ...rest, [permission]: choice };
}

export function draftCount(draft: RoleDraft): number {
  return Object.keys(draft).length;
}

export function draftsEqual(a: RoleDraft, b: RoleDraft): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<PermissionKey>;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/** Everything in `draft` the caller could not grant (above their own scope). */
export function ungrantable(
  draft: RoleDraft,
  grants: readonly Grant[],
  isSuperAdmin = false,
): PermissionKey[] {
  return (Object.keys(draft) as PermissionKey[]).filter((permission) => {
    const scope = draft[permission];
    if (!scope) return false;
    return isOwnerOnly(permission) || RANK[scope] > heldRank(grants, permission, isSuperAdmin);
  });
}

/** Permissions grouped by area, in the catalogue's order, for the matrix. */
const GROUP_OF: Partial<Record<PermissionArea, PermissionArea>> = {
  users: 'roles',
  forms: 'files',
};

export type PermissionGroup = { area: PermissionArea; keys: PermissionKey[] };

export function groupPermissions(): PermissionGroup[] {
  const order = Object.keys(AREA_LABEL_KEYS) as PermissionArea[];
  const groups = new Map<PermissionArea, PermissionKey[]>();
  for (const key of Object.keys(PERMISSIONS) as PermissionKey[]) {
    const area = key.split('.')[0] as PermissionArea;
    const group = GROUP_OF[area] ?? area;
    groups.set(group, [...(groups.get(group) ?? []), key]);
  }
  return order.flatMap((area) => {
    const keys = groups.get(area);
    return keys ? [{ area, keys }] : [];
  });
}

export const ROLE_NAME_MIN = 2;
export const ROLE_NAME_MAX = 60;

export type RoleDraftProblem = 'name' | 'empty' | null;

export function roleDraftProblem(name: string, draft: RoleDraft): RoleDraftProblem {
  const trimmed = name.trim();
  if (trimmed.length < ROLE_NAME_MIN || trimmed.length > ROLE_NAME_MAX) return 'name';
  if (draftCount(draft) === 0) return 'empty';
  return null;
}

/** Reason codes returned by the roles / members RPCs, each with its own message. */
export const ROLE_ERROR_KEYS = {
  forbidden: 'roles.errors.forbidden',
  feature_unavailable: 'roles.errors.feature_unavailable',
  invalid_name: 'roles.errors.invalid_name',
  name_taken: 'roles.errors.name_taken',
  too_many_roles: 'roles.errors.too_many_roles',
  not_found: 'roles.errors.not_found',
  invalid_permissions: 'roles.errors.invalid_permissions',
  empty_role: 'roles.errors.empty_role',
  unknown_permission: 'roles.errors.unknown_permission',
  invalid_scope: 'roles.errors.invalid_scope',
  duplicate_permission: 'roles.errors.duplicate_permission',
  billing_owner_only: 'roles.errors.billing_owner_only',
  cannot_grant: 'roles.errors.cannot_grant',
  system_role: 'roles.errors.system_role',
  nothing_to_change: 'roles.errors.nothing_to_change',
  role_in_use: 'roles.errors.role_in_use',
  invalid_replacement: 'roles.errors.invalid_replacement',
  role_unavailable: 'roles.errors.role_unavailable',
  invalid_branch: 'roles.errors.invalid_branch',
  member_not_active: 'roles.errors.member_not_active',
  cannot_modify_higher_role: 'roles.errors.cannot_modify_higher_role',
  last_owner: 'roles.errors.last_owner',
  use_revoke_invite: 'roles.errors.use_revoke_invite',
  cannot_remove_self: 'roles.errors.cannot_remove_self',
  unknown: 'roles.errors.unknown',
} as const;

export type RoleErrorCode = keyof typeof ROLE_ERROR_KEYS;

export function roleErrorKey(code: string | null): (typeof ROLE_ERROR_KEYS)[RoleErrorCode] {
  if (code && Object.prototype.hasOwnProperty.call(ROLE_ERROR_KEYS, code)) {
    return ROLE_ERROR_KEYS[code as RoleErrorCode];
  }
  return ROLE_ERROR_KEYS.unknown;
}
