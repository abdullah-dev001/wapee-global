import { describe, expect, it } from 'vitest';

import { PERMISSIONS, type PermissionKey } from '@/config/permissions';
import { type Grant } from '@/lib/permissions/types';

import { PERMISSION_LABEL_KEYS } from './permissionLabels';
import {
  isLaunchHidden,
  allowedScopes,
  draftCount,
  draftFromRows,
  draftToPayload,
  draftsEqual,
  groupPermissions,
  heldRank,
  heldRankAtBranch,
  isOwnerOnly,
  roleDraftProblem,
  roleErrorKey,
  setScope,
  ungrantable,
} from './rolesLogic';

const grants: Grant[] = [
  { permission: 'appointments.view', scope: 'branch', branchId: 'a' },
  { permission: 'appointments.view', scope: 'own', branchId: null },
  { permission: 'clients.view', scope: 'own', branchId: 'a' },
  { permission: 'roles.manage', scope: 'branch', branchId: 'a' },
];

describe('heldRank', () => {
  it('takes the highest scope held anywhere', () => {
    expect(heldRank(grants, 'appointments.view')).toBe(2);
    expect(heldRank(grants, 'clients.view')).toBe(1);
  });
  it('is 0 for a permission the caller lacks', () => {
    expect(heldRank(grants, 'invoices.create')).toBe(0);
  });
  it('a super admin holds everything at all scope', () => {
    expect(heldRank([], 'invoices.create', true)).toBe(3);
  });
});

describe('heldRankAtBranch', () => {
  // Manager at branch A only, Staff at branch B only — the live dual-role shape
  // this fix was found against (`roles.manage` held at branch A only).
  const dual: Grant[] = [
    { permission: 'appointments.view', scope: 'branch', branchId: 'a' },
    { permission: 'roles.manage', scope: 'branch', branchId: 'a' },
    { permission: 'appointments.view', scope: 'own', branchId: 'b' },
  ];

  it('reaches a branch-tied grant only at that same branch', () => {
    expect(heldRankAtBranch(dual, 'roles.manage', 'a')).toBe(2); // branch
    expect(heldRankAtBranch(dual, 'roles.manage', 'b')).toBe(0); // not held there
  });

  it('an `all`-scope grant reaches every branch', () => {
    const all: Grant[] = [{ permission: 'roles.manage', scope: 'all', branchId: 'a' }];
    expect(heldRankAtBranch(all, 'roles.manage', 'b')).toBe(3);
  });

  it('the caller\'s own "every branch" grant (branchId null) reaches every target branch', () => {
    const everyBranch: Grant[] = [{ permission: 'roles.manage', scope: 'branch', branchId: null }];
    expect(heldRankAtBranch(everyBranch, 'roles.manage', 'a')).toBe(2);
    expect(heldRankAtBranch(everyBranch, 'roles.manage', 'b')).toBe(2);
  });

  it('a branch-tied grant does NOT reach a target of "every branch"', () => {
    expect(heldRankAtBranch(dual, 'roles.manage', null)).toBe(0);
  });

  it('a super admin holds everything everywhere', () => {
    expect(heldRankAtBranch([], 'invoices.create', 'a', true)).toBe(3);
  });
});

describe('allowedScopes', () => {
  it('offers none and up to the held scope', () => {
    expect(allowedScopes(2, 'none', 'appointments.view')).toEqual(['none', 'own', 'branch']);
    expect(allowedScopes(1, 'none', 'clients.view')).toEqual(['none', 'own']);
  });
  it('offers nothing but none for a permission the caller lacks', () => {
    expect(allowedScopes(0, 'none', 'invoices.create')).toEqual(['none']);
  });
  it('keeps an existing higher value selectable so it is not silently lowered', () => {
    expect(allowedScopes(1, 'all', 'clients.view')).toEqual(['none', 'own', 'all']);
  });
  it('billing is Owner-only: never anything but none', () => {
    expect(isOwnerOnly('settings.billing')).toBe(true);
    expect(allowedScopes(3, 'none', 'settings.billing')).toEqual(['none']);
  });
});

describe('ungrantable', () => {
  it('lists permissions above what the caller holds, and billing', () => {
    const draft = {
      'appointments.view': 'all',
      'clients.view': 'own',
      'invoices.create': 'branch',
      'settings.billing': 'all',
    } as const;
    expect(ungrantable(draft, grants).sort()).toEqual(
      ['appointments.view', 'invoices.create', 'settings.billing'].sort(),
    );
  });
  it("is empty for a draft within the caller's holdings", () => {
    expect(ungrantable({ 'appointments.view': 'branch', 'clients.view': 'own' }, grants)).toEqual(
      [],
    );
  });
});

describe('draft <-> payload', () => {
  it('round-trips and sorts by permission', () => {
    const draft = draftFromRows([
      { permission: 'clients.view', scope: 'own' },
      { permission: 'appointments.view', scope: 'all' },
      { permission: 'not.real', scope: 'all' },
    ]);
    expect(draftToPayload(draft)).toEqual([
      { permission: 'appointments.view', scope: 'all' },
      { permission: 'clients.view', scope: 'own' },
    ]);
  });
  it('setScope none removes the permission; equality ignores order', () => {
    const a = setScope({ 'clients.view': 'own' }, 'clients.view', 'none');
    expect(draftCount(a)).toBe(0);
    expect(
      draftsEqual(
        { 'clients.view': 'own', 'staff.view': 'all' },
        { 'staff.view': 'all', 'clients.view': 'own' },
      ),
    ).toBe(true);
    expect(draftsEqual({ 'clients.view': 'own' }, { 'clients.view': 'branch' })).toBe(false);
  });
});

describe('groupPermissions', () => {
  it('covers every catalogue permission exactly once', () => {
    const all = groupPermissions().flatMap((group) => group.keys);
    expect(all.length).toBe(Object.keys(PERMISSIONS).length);
    expect(new Set(all).size).toBe(all.length);
  });
  it('merges users into roles and forms into files', () => {
    const groups = groupPermissions();
    expect(groups.find((g) => g.area === 'roles')?.keys).toContain('users.invite');
    expect(groups.find((g) => g.area === 'files')?.keys).toContain('forms.manage');
    expect(groups.find((g) => g.area === 'users')).toBeUndefined();
  });
});

describe('labels', () => {
  it('every permission has a label key', () => {
    for (const key of Object.keys(PERMISSIONS) as PermissionKey[]) {
      expect(PERMISSION_LABEL_KEYS[key]).toMatch(/^roles\.perm\./);
    }
  });
});

describe('roleDraftProblem', () => {
  it('needs a 2-60 character name and at least one permission', () => {
    expect(roleDraftProblem(' A ', { 'clients.view': 'own' })).toBe('name');
    expect(roleDraftProblem('x'.repeat(61), { 'clients.view': 'own' })).toBe('name');
    expect(roleDraftProblem('Front desk', {})).toBe('empty');
    expect(roleDraftProblem('Front desk', { 'clients.view': 'own' })).toBeNull();
  });
});

describe('roleErrorKey', () => {
  it('maps known codes and falls back for anything else', () => {
    expect(roleErrorKey('role_in_use')).toBe('roles.errors.role_in_use');
    expect(roleErrorKey('last_owner')).toBe('roles.errors.last_owner');
    expect(roleErrorKey('made_up')).toBe('roles.errors.unknown');
    expect(roleErrorKey(null)).toBe('roles.errors.unknown');
  });
});

describe('isLaunchHidden', () => {
  it('hides both SMS permissions while SMS is off', () => {
    expect(isLaunchHidden('sms.send', { sms: false })).toBe(true);
    expect(isLaunchHidden('sms.buy_credits', { sms: false })).toBe(true);
  });

  it('shows them again when SMS is on', () => {
    expect(isLaunchHidden('sms.send', { sms: true })).toBe(false);
    expect(isLaunchHidden('sms.buy_credits', { sms: true })).toBe(false);
  });

  it('never hides an unrelated permission', () => {
    expect(isLaunchHidden('clients.view', { sms: false })).toBe(false);
  });

  it('follows the real launch flag by default (SMS is off at launch)', () => {
    expect(isLaunchHidden('sms.send')).toBe(true);
  });
});
