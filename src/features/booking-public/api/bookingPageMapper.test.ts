import { describe, expect, it } from 'vitest';

import { mapBookingPage, type RawBookingPage } from './bookingPageMapper';

const branch = {
  id: 'b-up',
  name: 'Uptown',
  address: '9 Hill Road',
  timezone: 'Asia/Karachi',
  currency: 'PKR',
  country_code: 'PK',
};

const full: RawBookingPage = {
  needs_branch: false,
  branches: [
    { id: 'b-dt', name: 'Downtown', address: null, timezone: 'Europe/London', code: 'DT' },
    { id: 'b-up', name: 'Uptown', address: '9 Hill Road', timezone: 'Asia/Karachi', code: 'UP' },
  ],
  branch,
  settings: {
    staff_choice: 'optional',
    slot_display: 'only_available',
    show_prices: true,
    booking_window_days: 60,
    require_client_email: false,
    confirmation: 'auto',
  },
  services: [
    { id: 's1', name: 'Cut', duration_minutes: 60, category_name: null, price_minor: 4500000 },
  ],
  staff: [{ id: 'st1', display_name: 'Umar' }],
  service_staff: [{ service_id: 's1', staff_id: 'st1' }],
  fields: [],
};

describe('mapBookingPage', () => {
  it('maps a full page: the chosen location, its currency on every service, all locations listed', () => {
    const page = mapBookingPage(full);
    expect(page.needsBranch).toBe(false);
    if (page.needsBranch) return;
    expect(page.branch).toMatchObject({ id: 'b-up', name: 'Uptown', address: '9 Hill Road' });
    expect(page.settings.timezone).toBe('Asia/Karachi');
    expect(page.services[0]).toMatchObject({ priceMinor: 4500000, currency: 'PKR' });
    expect(page.branches.map((b) => b.code)).toEqual(['DT', 'UP']);
  });

  it('maps the picker response: only the locations, no catalogue', () => {
    const page = mapBookingPage({
      needs_branch: true,
      branches: full.branches,
      branch: null,
    } as RawBookingPage);
    expect(page.needsBranch).toBe(true);
    expect(page.branches).toHaveLength(2);
    expect(page).not.toHaveProperty('services');
  });

  it('reads a response without the newer fields as a single-location page', () => {
    const { needs_branch: _n, branches: _b, ...old } = full;
    const page = mapBookingPage({
      ...old,
      branch: { ...branch, address: undefined as unknown as null },
    } as unknown as RawBookingPage);
    expect(page.needsBranch).toBe(false);
    if (page.needsBranch) return;
    expect(page.branch.address).toBeNull();
    expect(page.branches).toEqual([]);
  });
});
