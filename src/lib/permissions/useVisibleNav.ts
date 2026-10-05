import { useMemo } from 'react';

import { navItems, type AppRoute, type NavItem } from '@/config/navigation';

import { can } from './can';
import { useGrantSet } from './useGrants';

/**
 * Navigation filtered by permission and plan.
 *
 * One place decides what a user may reach, so the sidebar, the bottom tabs, the
 * More screen and the route guard can never disagree (CLAUDE.md §4: navigation is
 * driven entirely by `config/navigation`).
 *
 * Hiding is not the boundary — `RouteGuard` blocks a typed URL and RLS blocks the
 * data. This just keeps the menus honest.
 */

export type VisibleNav = {
  items: readonly NavItem[];
  primary: readonly NavItem[];
  secondary: readonly NavItem[];
  /** True while the permission set loads; render skeletons rather than an empty menu. */
  isPending: boolean;
  /** Is this route allowed? Unknown routes are allowed (they are not nav destinations). */
  isRouteAllowed: (route: string) => boolean;
};

export function useVisibleNav(): VisibleNav {
  const { set, isPending } = useGrantSet();

  return useMemo(() => {
    // While loading, show nothing rather than items that may vanish a frame later.
    const allows = (item: (typeof navItems)[number]) =>
      item.permission
        ? can(set, item.permission) || (item.alsoPermission ? can(set, item.alsoPermission) : false)
        : true;
    const allowed = isPending ? [] : navItems.filter(allows);

    const byRoute = new Map(navItems.map((item) => [item.route as string, item]));

    return {
      items: allowed,
      primary: allowed.filter((item) => item.primary),
      secondary: allowed.filter((item) => !item.primary),
      isPending,
      isRouteAllowed: (route: string) => {
        const item = byRoute.get(route);
        // Not a nav destination (e.g. /more, a detail route): nothing to gate here.
        if (!item) return true;
        return allows(item);
      },
    };
  }, [set, isPending]);
}

/** The first route the user is actually allowed to open, for a safe redirect. */
export function useFallbackRoute(): AppRoute {
  const { primary, items } = useVisibleNav();
  // `/more` has no permission, so it is always a valid landing place.
  return primary[0]?.route ?? items[0]?.route ?? '/more';
}
