import { describe, expect, it } from 'vitest';

import { isBusinessActive } from './businessActive';

/**
 * Client-side mirror of SQL `business_is_active()` (useGrants.ts). The real
 * boundary is the database; this only pins the UI's own copy so it never
 * shows "unlocked" for longer than the server actually allows.
 */
describe('isBusinessActive', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('active with no period end is always active', () => {
    expect(isBusinessActive('active', null, null, now)).toBe(true);
  });

  it('active with a future period end is active', () => {
    expect(isBusinessActive('active', null, '2026-06-16T00:00:00Z', now)).toBe(true);
  });

  it('active with a past period end is inactive', () => {
    expect(isBusinessActive('active', null, '2026-06-14T00:00:00Z', now)).toBe(false);
  });

  it('active with a period end exactly now is inactive (strict greater-than)', () => {
    expect(isBusinessActive('active', null, now.toISOString(), now)).toBe(false);
  });

  it('trialing with a future trial end is active, ignoring any period end', () => {
    expect(isBusinessActive('trialing', '2026-06-20T00:00:00Z', '2026-06-01T00:00:00Z', now)).toBe(
      true,
    );
  });

  it('trialing with a past trial end is inactive', () => {
    expect(isBusinessActive('trialing', '2026-06-01T00:00:00Z', null, now)).toBe(false);
  });

  it('trialing with no trial end at all is inactive', () => {
    expect(isBusinessActive('trialing', null, null, now)).toBe(false);
  });

  it('suspended is always inactive, whatever the dates', () => {
    expect(isBusinessActive('suspended', '2026-06-20T00:00:00Z', null, now)).toBe(false);
  });

  it('inactive is always inactive', () => {
    expect(isBusinessActive('inactive', null, null, now)).toBe(false);
  });

  it('a null status is inactive', () => {
    expect(isBusinessActive(null, null, null, now)).toBe(false);
  });
});
