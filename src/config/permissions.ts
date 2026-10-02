/**
 * The permission catalogue (product doc §9), mirroring the `permissions` table.
 *
 * The database is the real boundary — RLS and the RPC checks decide what a
 * request may do. This list exists so a permission key is a compile-time type
 * instead of a free string, and so plan/add-on gating can be read without a
 * round trip. It must stay in step with the table: a migration that adds a
 * permission adds it here in the same task (CLAUDE.md §6).
 *
 * `minPlan` and `addon` are the Phase 8 gating inputs (product doc §8, §10).
 */

/** Plan tiers, cheapest first. Mirrors the `business_plan` enum. */
export const PLAN_ORDER = ['solo', 'team', 'business'] as const;
export type Plan = (typeof PLAN_ORDER)[number];

/** Paid add-ons, available on any plan (product doc §8.1). */
export type Addon = 'packages' | 'inventory' | 'files' | 'forms' | 'portal' | 'custom_roles';

type PermissionMeta = {
  /** Cheapest plan that includes it. Undefined = every plan. */
  minPlan?: Plan;
  /** Add-on that must be switched on. Undefined = no add-on needed. */
  addon?: Addon;
};

/**
 * All 46 permissions. The key order follows the table (area, then action).
 * A permission with neither `minPlan` nor `addon` is available to every plan.
 */
export const PERMISSIONS = {
  'appointments.approve': {},
  'appointments.cancel': {},
  'appointments.create': {},
  'appointments.edit': {},
  'appointments.view': {},
  'calendar.view_all_staff': {},
  'clients.create': {},
  'clients.edit': {},
  'clients.export': {},
  'clients.view': {},
  'clients.view_contact': {},
  'clients.view_sensitive': {},
  'commission.manage_rules': { minPlan: 'team' },
  'commission.view_all': { minPlan: 'team' },
  'commission.view_own': { minPlan: 'team' },
  'files.upload': { addon: 'files' },
  'files.view': { addon: 'files' },
  'forms.manage': { addon: 'forms' },
  'inventory.adjust': { addon: 'inventory' },
  'inventory.view': { addon: 'inventory' },
  'invoices.create': {},
  'invoices.credit_note': {},
  'invoices.discount': {},
  'invoices.view': {},
  'packages.deduct_session': { addon: 'packages' },
  'packages.reverse_session': { addon: 'packages' },
  'packages.sell': { addon: 'packages' },
  'reports.view_advanced': { minPlan: 'team' },
  'reports.view_basic': {},
  'reports.view_revenue': {},
  'reviews.feature_on_website': {},
  'reviews.reply': {},
  'reviews.view': {},
  'roles.manage': {},
  'services.manage': {},
  'settings.billing': {},
  'settings.booking': {},
  'settings.business': {},
  'sms.buy_credits': {},
  'sms.send': {},
  'staff.manage': {},
  'staff.manage_schedule': {},
  'staff.view': {},
  'users.invite': {},
  'website.edit': {},
  'website.publish': {},
} as const satisfies Record<string, PermissionMeta>;

/** A permission key, `area.action`. */
export type PermissionKey = keyof typeof PERMISSIONS;

/** Plan/add-on requirement for a permission, or `{}` when it needs neither. */
export function permissionMeta(key: PermissionKey): PermissionMeta {
  return PERMISSIONS[key];
}

/** True when `plan` is at least `minPlan` in the tier order. */
export function planAtLeast(plan: Plan, minPlan: Plan): boolean {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(minPlan);
}
