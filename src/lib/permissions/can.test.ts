import { describe, expect, it } from 'vitest';

import { navItems } from '@/config/navigation';
import { FEATURE_KEYS, type FeatureMap } from '@/features/plans/featureLogic';

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

/** Staff: 12 permissions at `own` scope (Phase 10 added packages.deduct_session, files.upload). */
const STAFF = grantsFor(
  [
    'appointments.create',
    'appointments.edit',
    'appointments.view',
    'clients.view',
    'clients.view_sensitive',
    'commission.view_own',
    'files.upload',
    'files.view',
    'packages.deduct_session',
    'reviews.view',
    'staff.manage_schedule',
    'staff.view',
  ],
  'own',
);

const ALL_FEATURES_ON: FeatureMap = Object.fromEntries(FEATURE_KEYS.map((key) => [key, true]));
/** What `my_features()` returns for each plan with no add-ons enabled. */
const SOLO_FEATURES: FeatureMap = {
  ...ALL_FEATURES_ON,
  default_roles: false,
  commission: false,
  embed_widget: false,
  advanced_reports: false,
  custom_roles: false,
  multi_branch: false,
  branch_comparison: false,
  packages: false,
  inventory: false,
  files_photos: false,
  forms_consent: false,
  client_portal: false,
};
const TEAM_FEATURES: FeatureMap = {
  ...SOLO_FEATURES,
  default_roles: true,
  commission: true,
  embed_widget: true,
  advanced_reports: true,
};

function makeSet(grants: Grant[], over: Partial<GrantSet> = {}): GrantSet {
  return {
    businessId: 'business-1',
    grants,
    isActive: true,
    // A trial: the server reports every feature on.
    features: ALL_FEATURES_ON,
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
    expect(STAFF).toHaveLength(12);
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
      'commission',
      'packages',
      'inventory',
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
      'commission',
      'packages',
      'inventory',
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
      'packages',
      'inventory',
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
      'commission',
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

describe('plan gating (server feature map)', () => {
  it('hides Team features on Solo', () => {
    const solo = makeSet(OWNER, { features: SOLO_FEATURES });
    expect(hasFeature(solo, 'commission.view_all')).toBe(false);
    expect(hasFeature(solo, 'reports.view_advanced')).toBe(false);
  });

  it('allows Team features on Team', () => {
    const team = makeSet(OWNER, { features: TEAM_FEATURES });
    expect(hasFeature(team, 'commission.view_all')).toBe(true);
    expect(hasFeature(team, 'reports.view_advanced')).toBe(true);
  });

  it('allows everything on a trial (the server reports all on)', () => {
    expect(hasFeature(makeSet(OWNER), 'commission.view_all')).toBe(true);
    expect(hasFeature(makeSet(OWNER), 'packages.sell')).toBe(true);
  });

  it('leaves unrestricted permissions alone on Solo', () => {
    expect(hasFeature(makeSet(OWNER, { features: SOLO_FEATURES }), 'reports.view_basic')).toBe(
      true,
    );
  });

  it('gates an add-on permission by the add-on flag', () => {
    expect(hasFeature(makeSet(OWNER, { features: SOLO_FEATURES }), 'packages.sell')).toBe(false);
    expect(
      hasFeature(
        makeSet(OWNER, { features: { ...SOLO_FEATURES, packages: true } }),
        'packages.sell',
      ),
    ).toBe(true);
    expect(
      hasFeature(
        makeSet(OWNER, { features: { ...SOLO_FEATURES, packages: true } }),
        'inventory.view',
      ),
    ).toBe(false);
  });

  it('keeps every gated permission OFF while the feature map is unknown', () => {
    const unknown = makeSet(OWNER, { features: null });
    expect(hasFeature(unknown, 'commission.view_all')).toBe(false);
    expect(hasFeature(unknown, 'files.view')).toBe(false);
    // ...but does not touch permissions that need no plan or add-on.
    expect(hasFeature(unknown, 'appointments.view')).toBe(true);
    expect(can(unknown, 'appointments.view')).toBe(true);
    expect(can(unknown, 'inventory.view')).toBe(false);
  });

  it('hides gated nav destinations only through can()', () => {
    // Commission needs the Team plan; Packages and Inventory need their add-on. On Solo with no
    // add-ons those three are the ONLY difference from the trial / Business nav.
    const trial = visibleNav(makeSet(OWNER));
    const solo = visibleNav(makeSet(OWNER, { features: SOLO_FEATURES }));
    expect(trial.filter((id) => !solo.includes(id))).toEqual([
      'commission',
      'packages',
      'inventory',
    ]);
    expect(solo.filter((id) => !trial.includes(id))).toEqual([]);
  });

  it('shows Packages and Inventory only while their own add-on is on', () => {
    const packagesOnly = visibleNav(
      makeSet(OWNER, { features: { ...SOLO_FEATURES, packages: true } }),
    );
    expect(packagesOnly).toContain('packages');
    expect(packagesOnly).not.toContain('inventory');
    const inventoryOnly = visibleNav(
      makeSet(OWNER, { features: { ...SOLO_FEATURES, inventory: true } }),
    );
    expect(inventoryOnly).toContain('inventory');
    expect(inventoryOnly).not.toContain('packages');
  });

  it('keeps both add-on screens hidden while the feature map is unknown', () => {
    const unknown = visibleNav(makeSet(OWNER, { features: null }));
    expect(unknown).not.toContain('packages');
    expect(unknown).not.toContain('inventory');
  });

  it('Staff may deduct sessions (own scope) but never sees Packages or Inventory screens', () => {
    const staff = makeSet(STAFF);
    expect(can(staff, 'packages.deduct_session')).toBe(true);
    expect(can(staff, 'packages.sell')).toBe(false);
    expect(can(staff, 'packages.reverse_session')).toBe(false);
    expect(can(staff, 'inventory.view')).toBe(false);
    expect(visibleNav(staff)).not.toContain('packages');
    expect(visibleNav(staff)).not.toContain('inventory');
  });

  it('a Receptionist sells and deducts but cannot reverse or adjust stock', () => {
    const recep = makeSet(RECEPTIONIST);
    expect(can(recep, 'packages.sell')).toBe(true);
    expect(can(recep, 'packages.deduct_session')).toBe(true);
    expect(can(recep, 'packages.reverse_session')).toBe(false);
    expect(can(recep, 'inventory.view')).toBe(true);
    expect(can(recep, 'inventory.adjust')).toBe(false);
  });
});

describe('super admin', () => {
  // No grants, dead business, cheapest plan: the platform flag still wins.
  const su = makeSet([], { isActive: false, features: SOLO_FEATURES, isSuperAdmin: true });

  it('passes permission, plan and trial checks', () => {
    expect(can(su, 'invoices.credit_note')).toBe(true);
    expect(hasFeature(su, 'commission.view_all')).toBe(true);
  });

  it('sees the whole navigation', () => {
    expect(visibleNav(su)).toHaveLength(navItems.length);
  });
});
