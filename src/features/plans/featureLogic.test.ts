import { describe, expect, it } from 'vitest';

import { PERMISSIONS, type PermissionKey } from '@/config/permissions';

import {
  ADDON_FEATURE_KEYS,
  FEATURE_KEYS,
  featureForPermission,
  featureForRoute,
  isAtCap,
  isFeatureOn,
  parsePlanSnapshot,
  usageRatio,
} from './featureLogic';
import { PLAN_ERROR_KEYS, planErrorCode, planErrorKey } from './planErrors';

const BUSINESS_PAYLOAD = {
  plan: 'business',
  status: 'trialing',
  trial: true,
  staff_cap: null,
  max_branches: null,
  active: true,
  features: {
    core: true,
    embed_widget: true,
    inventory: true,
    nonsense: true,
    multi_branch: 'yes',
  },
};

describe('parsePlanSnapshot', () => {
  it('parses the my_features payload', () => {
    const s = parsePlanSnapshot(BUSINESS_PAYLOAD);
    expect(s).toMatchObject({ plan: 'business', trial: true, active: true, staffCap: null });
    expect(s?.features.embed_widget).toBe(true);
  });

  it('drops unknown keys and non-boolean values', () => {
    const s = parsePlanSnapshot(BUSINESS_PAYLOAD);
    expect(s?.features).not.toHaveProperty('nonsense');
    expect(s?.features.multi_branch).toBeUndefined();
  });

  it('reads caps as numbers', () => {
    const s = parsePlanSnapshot({
      ...BUSINESS_PAYLOAD,
      plan: 'team',
      staff_cap: 5,
      max_branches: 1,
    });
    expect(s?.staffCap).toBe(5);
    expect(s?.maxBranches).toBe(1);
  });

  it('treats a lapsed trial (no plan, inactive) as such', () => {
    const s = parsePlanSnapshot({
      ...BUSINESS_PAYLOAD,
      plan: null,
      active: false,
      trial: false,
      status: 'inactive',
      features: {},
    });
    expect(s).toMatchObject({ plan: null, active: false, status: 'inactive' });
  });

  it.each([null, undefined, 3, 'x', {}, { status: 'bogus', features: {} }, { status: 'active' }])(
    'returns null for malformed input %#',
    (raw) => {
      expect(parsePlanSnapshot(raw)).toBeNull();
    },
  );
});

describe('isFeatureOn', () => {
  it('is off while the map is unknown', () => {
    expect(isFeatureOn(null, 'embed_widget')).toBe(false);
  });
  it('is off when missing or false, on only for true', () => {
    expect(isFeatureOn({}, 'embed_widget')).toBe(false);
    expect(isFeatureOn({ embed_widget: false }, 'embed_widget')).toBe(false);
    expect(isFeatureOn({ embed_widget: true }, 'embed_widget')).toBe(true);
  });
});

describe('featureForPermission', () => {
  it('maps plan-tier permissions', () => {
    expect(featureForPermission('commission.view_all')).toBe('commission');
    expect(featureForPermission('commission.manage_rules')).toBe('commission');
    expect(featureForPermission('reports.view_advanced')).toBe('advanced_reports');
  });
  it('maps add-on permissions to the server add-on keys', () => {
    expect(featureForPermission('files.upload')).toBe('files_photos');
    expect(featureForPermission('forms.manage')).toBe('forms_consent');
    expect(featureForPermission('inventory.view')).toBe('inventory');
    expect(featureForPermission('packages.sell')).toBe('packages');
  });
  it('leaves ungated permissions alone', () => {
    expect(featureForPermission('appointments.view')).toBeNull();
    expect(featureForPermission('settings.billing')).toBeNull();
  });
  it('maps EVERY gated permission in the catalogue to a real feature key', () => {
    for (const key of Object.keys(PERMISSIONS) as PermissionKey[]) {
      const meta = PERMISSIONS[key] as { minPlan?: string; addon?: string };
      const feature = featureForPermission(key);
      if (meta.minPlan || meta.addon) {
        expect(feature, key).not.toBeNull();
        expect(FEATURE_KEYS as readonly string[]).toContain(feature);
      } else {
        expect(feature, key).toBeNull();
      }
    }
  });
});

describe('add-on keys and routes', () => {
  it('every add-on key is a feature key', () => {
    for (const key of ADDON_FEATURE_KEYS) expect(FEATURE_KEYS as readonly string[]).toContain(key);
  });
  it('gates the widget screen', () => {
    expect(featureForRoute('/settings/widget')).toBe('embed_widget');
    expect(featureForRoute('/settings/booking')).toBeNull();
  });
});

describe('usage helpers', () => {
  it('computes the ratio, unlimited is null, clamped', () => {
    expect(usageRatio(2, 5)).toBe(0.4);
    expect(usageRatio(9, 5)).toBe(1);
    expect(usageRatio(3, null)).toBeNull();
    expect(usageRatio(0, 0)).toBeNull();
  });
  it('knows when one more would be refused', () => {
    expect(isAtCap(5, 5)).toBe(true);
    expect(isAtCap(4, 5)).toBe(false);
    expect(isAtCap(100, null)).toBe(false);
  });
});

describe('planErrorCode', () => {
  it('reads the trigger messages', () => {
    expect(planErrorCode({ message: 'staff_cap_reached', code: 'P0001' })).toBe(
      'staff_cap_reached',
    );
    expect(planErrorCode(new Error('branch_limit_reached'))).toBe('branch_limit_reached');
  });
  it('separates custom roles from the generic feature refusal', () => {
    expect(planErrorCode({ message: 'feature_unavailable', details: 'custom_roles' })).toBe(
      'custom_roles_unavailable',
    );
    expect(planErrorCode({ message: 'feature_unavailable' })).toBe('feature_unavailable');
    expect(planErrorCode({ code: 'feature_unavailable', feature: 'custom_roles' })).toBe(
      'custom_roles_unavailable',
    );
    expect(planErrorCode({ code: 'feature_unavailable', feature: 'inventory' })).toBe(
      'feature_unavailable',
    );
  });
  it('ignores everything else', () => {
    expect(planErrorCode(new Error('network down'))).toBeNull();
    expect(planErrorCode(null)).toBeNull();
    expect(planErrorKey('whatever')).toBeNull();
  });
  it('has a message key for every code', () => {
    for (const code of [
      'staff_cap_reached',
      'branch_limit_reached',
      'feature_unavailable',
    ] as const) {
      expect(planErrorKey({ message: code })).toBe(PLAN_ERROR_KEYS[code]);
    }
    expect(Object.keys(PLAN_ERROR_KEYS)).toHaveLength(4);
  });
});
