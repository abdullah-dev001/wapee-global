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
  it('waits while a just-joined membership list is still refetching', () => {
    // hasBusiness=false (stale cache), isFetching=true (invalidated refetch in
    // flight), not on onboarding — the exact post-join moment.
    expect(shouldWaitForRejoin(false, true, false)).toBe(true);
  });

  it('does not wait once the refetch has landed a real business', () => {
    expect(shouldWaitForRejoin(true, false, false)).toBe(false);
    expect(shouldWaitForRejoin(true, true, false)).toBe(false);
  });

  it('does not wait when the list is not fetching at all', () => {
    expect(shouldWaitForRejoin(false, false, false)).toBe(false);
  });

  it('never waits on the onboarding screen, even with zero businesses and a refetch in flight', () => {
    expect(shouldWaitForRejoin(false, true, true)).toBe(false);
  });
});

describe('authGateDecision', () => {
  const base = {
    isSupabaseConfigured: true,
    loading: false,
    isAuthenticated: false,
    isEmailVerified: false,
    isPasswordRecovery: false,
    segments: [] as readonly string[],
    hasBusiness: false,
    waitForBusinesses: false,
    waitForRejoin: false,
    waitForClaim: false,
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

  it('waits for the first claim of pending adds before sending a business-less user to onboarding', () => {
    // A person added by email has zero businesses until claim_pending_memberships
    // lands; deciding earlier would flash /onboarding (the 2026-10-12 bug class).
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: false,
        segments: ['(auth)', 'auth', 'callback'],
        waitForClaim: true,
      }),
    ).toEqual({ kind: 'wait' });
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: false,
        segments: ['(auth)', 'verify'],
        waitForClaim: true,
      }),
    ).toEqual({ kind: 'wait' });
  });

  it('never waits for the claim while the email is unverified (it would join nothing)', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: false,
        segments: ['(app)', 'today'],
        waitForClaim: true,
      }),
    ).toEqual({ kind: 'redirect', href: '/verify' });
  });

  it('a claim that joined a business sends the user home, not to onboarding', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: true,
        segments: ['(auth)', 'auth', 'callback'],
      }),
    ).toEqual({ kind: 'redirect', href: '/' });
  });

  it('the retired /accept-invite page is an ordinary (auth) screen now', () => {
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: false,
        segments: ['(auth)', 'accept-invite'],
      }),
    ).toEqual({ kind: 'render' });
    expect(
      authGateDecision({
        ...base,
        isAuthenticated: true,
        isEmailVerified: true,
        hasBusiness: true,
        segments: ['(auth)', 'accept-invite'],
      }),
    ).toEqual({ kind: 'redirect', href: '/' });
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

  it('waits instead of deciding while a just-joined membership list is still refetching (waitForRejoin)', () => {
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

  describe('password recovery (the production bug this guards against)', () => {
    it('sends a recovery session to /reset-password from an ordinary private route, even with a business', () => {
      // Without this rule, a verified user with a business opening a reset
      // link would be bounced straight to "/" by the hasBusiness+isAuthGroup
      // rule below, before ever seeing the reset screen.
      expect(
        authGateDecision({
          ...base,
          isAuthenticated: true,
          isEmailVerified: true,
          isPasswordRecovery: true,
          hasBusiness: true,
          segments: ['(app)', 'today'],
        }),
      ).toEqual({ kind: 'redirect', href: '/reset-password' });
    });

    it('sends a recovery session to /reset-password even with no business yet (would otherwise go to onboarding)', () => {
      expect(
        authGateDecision({
          ...base,
          isAuthenticated: true,
          isEmailVerified: true,
          isPasswordRecovery: true,
          hasBusiness: false,
          segments: ['(app)', 'today'],
        }),
      ).toEqual({ kind: 'redirect', href: '/reset-password' });
    });

    it('sends a recovery session to /reset-password even from an (auth) screen with a business (would otherwise go to /)', () => {
      expect(
        authGateDecision({
          ...base,
          isAuthenticated: true,
          isEmailVerified: true,
          isPasswordRecovery: true,
          hasBusiness: true,
          segments: ['(auth)', 'login'],
        }),
      ).toEqual({ kind: 'redirect', href: '/reset-password' });
    });

    it('never redirects a recovery session once it is already on /reset-password', () => {
      expect(
        authGateDecision({
          ...base,
          isAuthenticated: true,
          isEmailVerified: true,
          isPasswordRecovery: true,
          hasBusiness: true,
          segments: ['(auth)', 'reset-password'],
        }),
      ).toEqual({ kind: 'render' });
      // Also true for a business-less / unverified-looking combination — the
      // reset screen is reachable unconditionally once recovery is flagged.
      expect(
        authGateDecision({
          ...base,
          isAuthenticated: true,
          isEmailVerified: true,
          isPasswordRecovery: true,
          hasBusiness: false,
          segments: ['(auth)', 'reset-password'],
        }),
      ).toEqual({ kind: 'render' });
    });

    it('recovery outranks the unverified-email redirect too', () => {
      expect(
        authGateDecision({
          ...base,
          isAuthenticated: true,
          isEmailVerified: false,
          isPasswordRecovery: true,
          segments: ['(app)', 'today'],
        }),
      ).toEqual({ kind: 'redirect', href: '/reset-password' });
    });
  });
});
