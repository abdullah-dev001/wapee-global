import {
  CalendarDays,
  LayoutDashboard,
  Package,
  Receipt,
  Scissors,
  Settings,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * THE single source of navigation. The sidebar, the mobile bottom tabs and the
 * "More" screen all read this file, so adding a destination or gating one later
 * never means touching a layout component.
 *
 * Gating is declared here but not enforced yet (no auth or plans exist in Phase 0):
 * `permission` and `feature` are read by the shell once `can()` / `useFeature()` land.
 */

/** Route under the (app) group. Keep in step with the files in app/(app)/. */
export type AppRoute =
  | '/today'
  | '/calendar'
  | '/clients'
  | '/services'
  | '/staff'
  | '/invoices'
  | '/reports'
  | '/reviews'
  | '/settings'
  | '/more';

/** Nav ids, which are also the i18n key suffixes (`nav.<id>`). */
export type NavId =
  | 'today'
  | 'calendar'
  | 'clients'
  | 'services'
  | 'staff'
  | 'invoices'
  | 'reports'
  | 'reviews'
  | 'settings'
  | 'more';

export type NavItem = {
  /** Stable id, also the i18n key suffix: `nav.<id>`. */
  id: NavId;
  route: AppRoute;
  icon: LucideIcon;
  /** Permission needed to see it (product doc §9). Undefined = everyone. */
  permission?: string;
  /** Plan feature or add-on needed (product doc §8). Undefined = every plan. */
  feature?: string;
  /** Build phase that fills this screen in; shown by the placeholder for now. */
  phase: number;
  /** Shown in the mobile bottom tab bar. Exactly three, plus "More". */
  primary?: boolean;
};

/**
 * Flat list, in sidebar order (DESIGN_GUIDE §13.2: one flat list, no section labels).
 */
export const navItems: readonly NavItem[] = [
  { id: 'today', route: '/today', icon: LayoutDashboard, phase: 4, primary: true },
  {
    id: 'calendar',
    route: '/calendar',
    icon: CalendarDays,
    permission: 'appointments.view',
    phase: 4,
    primary: true,
  },
  {
    id: 'clients',
    route: '/clients',
    icon: Users,
    permission: 'clients.view',
    phase: 4,
    primary: true,
  },
  { id: 'services', route: '/services', icon: Scissors, permission: 'services.manage', phase: 2 },
  { id: 'staff', route: '/staff', icon: Users, permission: 'staff.view', phase: 2 },
  { id: 'invoices', route: '/invoices', icon: Receipt, permission: 'invoices.view', phase: 5 },
  { id: 'reports', route: '/reports', icon: Package, permission: 'reports.view_basic', phase: 5 },
  { id: 'reviews', route: '/reviews', icon: Star, permission: 'reviews.view', phase: 7 },
  { id: 'settings', route: '/settings', icon: Settings, permission: 'settings.business', phase: 1 },
] as const;

/** The three primary destinations in the mobile tab bar (plus "More"). */
export const primaryNavItems = navItems.filter((item) => item.primary);

/** Everything the "More" screen lists: the destinations not in the tab bar. */
export const secondaryNavItems = navItems.filter((item) => !item.primary);

/** Route of the mobile "More" tab. */
export const MORE_ROUTE = '/more' satisfies AppRoute;

/** i18n key for a nav item's label (namespace `common`). */
export function navLabelKey<T extends NavId>(id: T): `nav.${T}` {
  return `nav.${id}`;
}
