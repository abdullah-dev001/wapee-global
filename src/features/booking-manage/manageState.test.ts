import { describe, expect, it } from 'vitest';

import { cancelledView } from './manageState';
import type { ManageBookingView } from './types';

const booking: ManageBookingView = {
  status: 'confirmed',
  startsAt: '2026-10-20T09:00:00Z',
  endsAt: '2026-10-20T09:30:00Z',
  timezone: 'Europe/London',
  localDate: '2026-10-20',
  localMinute: 600,
  serviceName: 'Consultation',
  staffName: 'Ann',
  branchName: 'Main',
  branchAddress: null,
  businessName: 'Clinic',
  clientFirstName: 'Sam',
  priceMinor: 4550,
  currency: 'GBP',
  canCancel: true,
  canReschedule: true,
  cancelCutoffHours: 24,
};

describe('cancelledView', () => {
  it('marks the booking cancelled and removes every action', () => {
    const v = cancelledView(booking);
    expect(v.status).toBe('cancelled');
    expect(v.canCancel).toBe(false);
    expect(v.canReschedule).toBe(false);
  });

  it('keeps what the guest already saw (service, time, place, price)', () => {
    const v = cancelledView(booking);
    expect(v.serviceName).toBe('Consultation');
    expect(v.localDate).toBe('2026-10-20');
    expect(v.localMinute).toBe(600);
    expect(v.priceMinor).toBe(4550);
    expect(v.clientFirstName).toBe('Sam');
  });

  it('does not mutate the original view', () => {
    cancelledView(booking);
    expect(booking.status).toBe('confirmed');
    expect(booking.canCancel).toBe(true);
  });
});
