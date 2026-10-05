import { describe, expect, it } from 'vitest';

import { navItems } from '@/config/navigation';

import { can, hasFeature, hasPermission } from './can';
import { type Grant, type GrantSet } from './types';

/**
 * Permission rules (product doc §9, §10).
 *
 * The grant fixtures below are the real output of `my_grants()` for the four
 * seeded system roles, taken from the live database. If a migration changes the
 * seeded roles, these counts fail first — which is the point.
 */

const BRANCH = 'branch-1';
const OTHER_BRANCH = 'branch-2';

function grantsFor(permissions: readonly string[], scope: Grant['scope']): Grant[] {
  return permissions.map((permission) => ({ permission, scope, branchId: BRANCH }));
}

/** Owner: all 46 permissions at `all` scope. */
const OWNER = grantsFor(
  [
    'appointments.approve',
    'appointments.cancel',
    'appointments.create',
    'appointments.edit',
    'appointments.view',
    'calendar.view_all_staff',
    'clients.create',
    'clients.edit',
    'clients.export',
    'clients.view',
    'clients.view_contact',
    'clients.view_sensitive',
    'commission.manage_rules',
    'commission.view_all',
    'commission.view_own',
    'files.upload',
    'files.view',
    'forms.manage',
    'inventory.adjust',
    'inventory.view',
    'invoices.create',
    'invoices.credit_note',
    'invoices.discount',
    'invoices.view',
    'packages.deduct_session',
    'packages.reverse_session',
    'packages.sell',
    'reports.view_advanced',
    'reports.view_basic',
    'reports.view_revenue',
    'reviews.feature_on_website',
    'reviews.reply',
    'reviews.view',
    'roles.manage',
    'services.manage',
    'settings.billing',
    'settings.booking',
    'settings.business',
    'sms.buy_credits',
    'sms.send',
    'staff.manage',
    'staff.manage_schedule',
    'staff.view',
    'users.invite',
    'website.edit',
    'website.publish',
  ],
  'all',
);

/**
 * Manager: 39 permissions at `branch` scope.
 *
 * Note what is NOT here: `settings.business` and `website.edit`. Product doc §9
 * gives Manager "Booking settings" only, so Manager holds `settings.booking` and
 * cannot open the Settings screen (migration 20261002170000).
 */
const MANAGER = grantsFor(
  [
    'appointments.approve',
    'appointments.cancel',
    'appointments.create',
    'appointments.edit',
    'appointments.view',
    'calendar.view_all_staff',
    'clients.create',
    'clients.edit',
    'clients.export',
    'clients.view',
    'clients.view_contact',
    'clients.view_sensitive',
    'commission.view_all',
    'commission.view_own',
    'files.upload',
    'files.view',
    'forms.manage',
    'inventory.adjust',
    'inventory.view',
    'invoices.create',
    'invoices.credit_note',
    'invoices.discount',
    'invoices.view',
    'packages.deduct_session',
    'packages.reverse_session',
    'packages.sell',
    'reports.view_advanced',
    'reports.view_basic',
    'reports.view_revenue',
    'reviews.feature_on_website',
    'reviews.reply',
    'reviews.view',
    'services.manage',
    'settings.booking',
    'sms.send',
    'staff.manage',
    'staff.manage_schedule',
    'staff.view',
    'users.invite',
  ],
  'branch',
);

/** Receptionist: 20 permissions at `branch` scope. */
const RECEPTIONIST = grantsFor(
  [
    'appointments.approve',
    'appointments.cancel',
    'appointments.create',
    'appointments.edit',
    'appointments.view',
    'calendar.view_all_staff',
    'clients.create',
    'clients.edit',
    'clients.view',
    'clients.view_contact',
    'files.upload',
    'files.view',
    'inventory.view',
    'invoices.create',
    'invoices.view',
    'packages.deduct_session',
    'packages.sell',
    'reviews.view',
    'sms.send',
    'staff.view',
  ],
  'branch',
);

/** Staff: 10 permissions at `own` scope. */
const STAFF = grantsFor(
  [
    'appointments.create',
    'appointments.edit',
    'appointments.view',
    'clients.view',
    'clients.view_sensitive',
    'commission.view_own',
    'files.view',
    'reviews.view',
    'staff.manage_schedule',
    'staff.view',
  ],
  'own',
);

function makeSet(grants: Grant[], over: Partial<GrantSet> = {}): GrantSet {
  return {
    businessId: 'business-1',
    grants,
    isActive: true,
    // null = on trial, no plan assigned yet.
    plan: null,
    isSuperAdmin: false,
    ...over,
  };
}

/** The nav ids `useVisibleNav()` would show, using the same rule. */
function visibleNav(set: GrantSet): string[] {
  return navItems
    .filter((item) =>
      item.permission
        ? can(set, item.permission) || (item.alsoPermission ? can(set, item.alsoPermission) : false)
        : true,
    )
    .map((i) => i.id);
}

describe('seeded role fixtures match the database', () => {
  it('has the documented permission counts', () => {
    expect(OWNER).toHaveLength(46);
    expect(MANAGER).toHaveLength(39);
    expect(RECEPTIONIST).toHaveLength(20);
    expect(STAFF).toHaveLength(10);
  });

  it('gives Manager booking settings but not business settings or the website', () => {
    // The exact row from product doc §9: "Website and settings | Yes | Booking
    // settings | No | No". The seed once granted all three to Manager.
    const manager = makeSet(MANAGER);
    expect(can(manager, 'settings.booking')).toBe(true);
    expect(can(manager, 'settings.business')).toBe(false);
    expect(can(manager, 'website.edit')).toBe(false);
    expect(can(manager, 'settings.billing')).toBe(false);
  });
});

describe('navigation per role', () => {
  it('shows an owner everything', () => {
    expect(visibleNav(makeSet(OWNER))).toEqual([
      'today',
      'calendar',
      'clients',
      'services',
      'staff',
      'members',
      'schedule',
      'invoices',
      'reports',
      'reviews',
      'website',
      'settings',
    ]);
  });

  it('gives a manager everything, Settings included', () => {
    // Manager has no business settings (migration 20261002170000) but does hold
    // settings.booking, which opens the Settings hub (booking, notifications, log).
    expect(visibleNav(makeSet(MANAGER))).toEqual([
      'today',
      'calendar',
      'clients',
      'services',
      'staff',
      'members',
      'schedule',
      'invoices',
      'reports',
      'reviews',
      'settings',
    ]);
  });

  it('hides reports, services and settings from a receptionist', () => {
    expect(visibleNav(makeSet(RECEPTIONIST))).toEqual([
      'today',
      'calendar',
      'clients',
      'staff',
      'members',
      'schedule',
      'invoices',
      'reviews',
    ]);
  });

  it('hides invoices, reports, services and settings from staff', () => {
    expect(visibleNav(makeSet(STAFF))).toEqual([
      'today',
      'calendar',
      'clients',
      'staff',
      'members',
      'schedule',
      'reviews',
    ]);
  });

  it('shows only unrestricted items when the grant set is empty', () => {
    // The loading and "not a member" case. Denying by default is the safe one.
    expect(visibleNav(makeSet([]))).toEqual(['today']);
  });
});

describe('scope rules mirror has_permission()', () => {
  const branchOnly: Grant[] = [{ permission: 'clients.view', scope: 'branch', branchId: BRANCH }];

  it('allows the branch the role is assigned to', () => {
    expect(hasPermission(makeSet(branchOnly), 'clients.view', BRANCH)).toBe(true);
  });

  it('refuses a different branch', () => {
    expect(hasPermission(makeSet(branchOnly), 'clients.view', OTHER_BRANCH)).toBe(false);
  });

  it('answers "anywhere" from any branch assignment', () => {
    expect(hasPermission(makeSet(branchOnly), 'clients.view', null)).toBe(true);
  });

  it('ignores the branch entirely at `all` scope', () => {
    const all: Grant[] = [{ permission: 'clients.view', scope: 'all', branchId: BRANCH }];
    expect(hasPermission(makeSet(all), 'clients.view', OTHER_BRANCH)).toBe(true);
  });

  it('treats a null branch assignment as every branch', () => {
    const everyBranch: Grant[] = [{ permission: 'clients.view', scope: 'branch', branchId: null }];
    expect(hasPermission(makeSet(everyBranch), 'clients.view', OTHER_BRANCH)).toBe(true);
  });
});

describe('inactive business (trial over)', () => {
  const dead = makeSet(OWNER, { isActive: false });

  it('blocks operational areas even for an owner', () => {
    expect(can(dead, 'clients.view')).toBe(false);
    expect(can(dead, 'invoices.create')).toBe(false);
  });

  it('keeps settings and billing reachable so the owner can pay', () => {
    expect(can(dead, 'settings.business')).toBe(true);
    expect(can(dead, 'settings.billing')).toBe(true);
  });

  it('collapses the nav to Today and Settings', () => {
    expect(visibleNav(dead)).toEqual(['today', 'settings']);
  });
});

describe('plan gating', () => {
  it('hides Team features on Solo', () => {
    expect(hasFeature(makeSet(OWNER, { plan: 'solo' }), 'commission.view_all')).toBe(false);
    expect(hasFeature(makeSet(OWNER, { plan: 'solo' }), 'reports.view_advanced')).toBe(false);
  });

  it('allows Team features on Team and Business', () => {
    expect(hasFeature(makeSet(OWNER, { plan: 'team' }), 'commission.view_all')).toBe(true);
    expect(hasFeature(makeSet(OWNER, { plan: 'business' }), 'commission.view_all')).toBe(true);
  });

  it('treats no plan as a trial that includes everything', () => {
    // `businesses.plan` is null until a super admin assigns one (product doc §10).
    expect(hasFeature(makeSet(OWNER, { plan: null }), 'commission.view_all')).toBe(true);
  });

  it('leaves unrestricted features alone on Solo', () => {
    expect(hasFeature(makeSet(OWNER, { plan: 'solo' }), 'reports.view_basic')).toBe(true);
  });

  it('counts an add-on as on until Phase 8, but respects an explicit off', () => {
    expect(hasFeature(makeSet(OWNER, { plan: 'solo' }), 'packages.sell')).toBe(true);
    expect(hasFeature(makeSet(OWNER, { plan: 'solo' }), 'packages.sell', { packages: false })).toBe(
      false,
    );
  });
});

describe('super admin', () => {
  // No grants, dead business, cheapest plan: the platform flag still wins.
  const su = makeSet([], { isActive: false, plan: 'solo', isSuperAdmin: true });

  it('passes permission, plan and trial checks', () => {
    expect(can(su, 'invoices.credit_note')).toBe(true);
    expect(hasFeature(su, 'commission.view_all')).toBe(true);
  });

  it('sees the whole navigation', () => {
    expect(visibleNav(su)).toHaveLength(navItems.length);
  });
});
