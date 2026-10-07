import { describe, expect, it } from 'vitest';

import { cleanEmail, paymentLabelKey, portalErrorKey, visibleTabs } from './portalLogic';

describe('cleanEmail', () => {
  it('trims and lower-cases a valid address', () =>
    expect(cleanEmail('  Alice@Example.COM ')).toBe('alice@example.com'));
  it('refuses anything that cannot be an address', () => {
    expect(cleanEmail('alice')).toBeNull();
    expect(cleanEmail('a b@c.d')).toBeNull();
    expect(cleanEmail('')).toBeNull();
    expect(cleanEmail('a@b')).toBeNull();
  });
});

describe('visibleTabs', () => {
  it('always bookings + invoices; add-on tabs only when on', () => {
    expect(visibleTabs(null)).toEqual(['bookings', 'invoices']);
    expect(visibleTabs({ packages: true, files: true, forms: true })).toEqual([
      'bookings',
      'packages',
      'invoices',
      'photos',
      'forms',
    ]);
    expect(visibleTabs({ packages: false, files: true, forms: false })).toEqual([
      'bookings',
      'invoices',
      'photos',
    ]);
  });
});

describe('error + payment keys', () => {
  it('maps known codes with a safe fallback', () => {
    expect(portalErrorKey('cancel_window_passed')).toBe('portal.errors.cancel_window_passed');
    expect(portalErrorKey('toString')).toBe('portal.errors.unknown');
    expect(portalErrorKey(undefined)).toBe('portal.errors.unknown');
  });
  it('labels payment status', () => {
    expect(paymentLabelKey('paid')).toBe('portal.invoices.paid');
    expect(paymentLabelKey('partial')).toBe('portal.invoices.partial');
    expect(paymentLabelKey(null)).toBe('portal.invoices.pending');
  });
});
