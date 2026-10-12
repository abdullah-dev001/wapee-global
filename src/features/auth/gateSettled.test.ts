import { describe, expect, it } from 'vitest';

import { authGateDecision, shouldWaitForRejoin, showGateSpinner } from './gateSettled';

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

describe('authGateDecision', () => {
  const base = {
    isSupabaseConfigured: true,
    loading: false,
    isAuthenticated: false,
    isEmailVerified: false,
    segments: [] as readonly string[],
    hasBusiness: false,
    waitForBusinesses: false,
    waitForRejoin: false,
  };

  it('renders through when Supabase is not configured, regardless of everything else', () => {
    expect(authGateDecision({ ...base, isSupabaseConfigured: false, loading: true })).toEqual({
      kind: 'render',
    });
  });

  it('waits (never renders a bare redirect/unmount) while the session is still loading', () => {
    expect(authGateDecision({ ...base, loading: true })).toEqual({ kind: 'wait' });
  });

  it('sends a signed-out visitor on a private route to /login', () => {
    expect(
      authGateDecision({ ...base, isAuthenticated: false, segments: ['(app)', 'today'] }),
    ).toEqual({ kind: 'redirect', href: '/login' });
  });

  it('lets a signed-out visitor stay on a public route', () => {
    expect(
      authGateDecision({ ...base, isAuthenticated: false, segments: ['(auth)', 'login'] }),
    ).toEqual({ kind: 'render' });
  });

  it('sends a signed-in but unverified user to /verify', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: false,
        segments: ['(app)', 'today'],
      }),
    ).toEqual({ kind: 'redirect', href: '/verify' });
  });

  it('never redirects an unverified user already on /verify', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: false,
        segments: ['(auth)', 'verify'],
      }),
    ).toEqual({ kind: 'render' });
  });

  it('sends a verified user with no business to /onboarding', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: false,
        segments: ['(app)', 'today'],
      }),
    ).toEqual({ kind: 'redirect', href: '/onboarding' });
  });

  it('never redirects a verified user with no business away from /accept-invite — the actual bug', () => {
    // This is the exact regression this suite exists for: a user arriving at
    // /accept-invite?token=… with zero businesses (not yet joined) must stay
    // on that screen, never bounce to /onboarding, so its own auto-join effect
    // gets the chance to run. See members.md changelog 2026-10-12.
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: false,
        segments: ['(auth)', 'accept-invite'],
      }),
    ).toEqual({ kind: 'render' });
  });

  it('never redirects a verified user with no business away from /onboarding itself', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: false,
        segments: ['(auth)', 'onboarding'],
      }),
    ).toEqual({ kind: 'render' });
  });

  it('never redirects a business-less super admin away from the admin area', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: false,
        segments: ['(admin)'],
      }),
    ).toEqual({ kind: 'render' });
  });

  it('sends a verified user with a business away from an (auth) screen to /', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: true,
        segments: ['(auth)', 'login'],
      }),
    ).toEqual({ kind: 'redirect', href: '/' });
  });

  it('never redirects away from /accept-invite even once the user has another business', () => {
    // Someone already in one business can still open a second invite link.
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: true,
        segments: ['(auth)', 'accept-invite'],
      }),
    ).toEqual({ kind: 'render' });
  });

  it('waits instead of deciding while the membership list is still pending', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        segments: ['(app)', 'today'],
        waitForBusinesses: true,
      }),
    ).toEqual({ kind: 'wait' });
  });

  it('waits instead of deciding while a just-accepted invite is still refetching (waitForRejoin)', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        segments: [],
        hasBusiness: false,
        waitForRejoin: true,
      }),
    ).toEqual({ kind: 'wait' });
  });

  it('renders through a fully signed-in user on an ordinary private route', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: true,
        segments: ['(app)', 'today'],
      }),
    ).toEqual({ kind: 'render' });
  });
});
