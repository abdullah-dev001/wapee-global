import { describe, expect, it } from 'vitest';

import { shouldWaitForRejoin, showGateSpinner } from './gateSettled';

describe('showGateSpinner', () => {
  it('shows the spinner on the first load of a user', () => {
    expect(showGateSpinner(true, null, 'u1')).toBe(true);
  });

  it('shows nothing once loaded', () => {
    expect(showGateSpinner(false, null, 'u1')).toBe(false);
    expect(showGateSpinner(false, 'u1', 'u1')).toBe(false);
  });

  it('never replaces the app with a spinner after the gate settled for the same user (tab refocus)', () => {
    expect(showGateSpinner(true, 'u1', 'u1')).toBe(false);
  });

  it('shows the spinner again for a different user', () => {
    expect(showGateSpinner(true, 'u1', 'u2')).toBe(true);
  });
});

describe('shouldWaitForRejoin', () => {
  it('waits while a just-accepted invite is still refetching the membership list', () => {
    // hasBusiness=false (stale cache), isFetching=true (invalidated refetch in
    // flight), not on onboarding or accept-invite — the exact post-join moment.
    expect(shouldWaitForRejoin(false, true, false, false)).toBe(true);
  });

  it('does not wait once the refetch has landed a real business', () => {
    expect(shouldWaitForRejoin(true, false, false, false)).toBe(false);
    expect(shouldWaitForRejoin(true, true, false, false)).toBe(false);
  });

  it('does not wait when the list is not fetching at all', () => {
    expect(shouldWaitForRejoin(false, false, false, false)).toBe(false);
  });

  it('never waits on the onboarding screen, even with zero businesses and a refetch in flight', () => {
    expect(shouldWaitForRejoin(false, true, true, false)).toBe(false);
  });

  it('never waits on the accept-invite screen, even with zero businesses and a refetch in flight', () => {
    expect(shouldWaitForRejoin(false, true, false, true)).toBe(false);
  });
});
