import { describe, expect, it } from 'vitest';

import { navItems } from '@/config/navigation';

import { isRouteAllowedWhenInactive } from './inactiveRoutes';

/**
 * The trial lock (product doc §10, decision 12). `business_is_active()` is the
 * real boundary; these tests pin the UI's route list so a new screen cannot
 * quietly become reachable while a business is locked.
 */
describe('routes allowed while the business is inactive', () => {
  it('keeps settings and billing reachable so the owner can pay', () => {
    expect(isRouteAllowedWhenInactive('/settings')).toBe(true);
    expect(isRouteAllowedWhenInactive('/billing')).toBe(true);
  });

  it('keeps /more reachable, which is the only route to Settings on mobile', () => {
    expect(isRouteAllowedWhenInactive('/more')).toBe(true);
  });

  it('locks every operational area', () => {
    for (const route of ['/today', '/calendar', '/clients', '/invoices', '/reports', '/members']) {
      expect(isRouteAllowedWhenInactive(route), route).toBe(false);
    }
  });

  it('locks all but the allowed nav destinations', () => {
    const open = navItems.filter((item) => isRouteAllowedWhenInactive(item.route)).map((i) => i.id);
    // Only Settings, out of the whole menu. (/more is a tab, not a navItem.)
    expect(open).toEqual(['settings']);
  });

  it('matches nested routes under an allowed one', () => {
    // A detail screen under settings must not be locked out.
    expect(isRouteAllowedWhenInactive('/settings/branches')).toBe(true);
  });
});
