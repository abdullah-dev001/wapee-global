import { describe, expect, it } from 'vitest';

import {
  ADMIN_ERROR_KEYS,
  ADMIN_REAUTH,
  ADMIN_SESSION_MAX_AGE_MS,
  AdminRpcError,
  adminAccess,
  adminErrorKey,
  adminRedirect,
  isAdminSessionFresh,
  parseOverLimit,
  passwordSignInAt,
  unwrapAdminResult,
} from './adminLogic';

function jwt(payload: object): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('passwordSignInAt', () => {
  const T = 1_790_000_000;
  it('reads the password entry of the amr claim (seconds -> ms)', () => {
    expect(passwordSignInAt(jwt({ amr: [{ method: 'password', timestamp: T }] }))).toBe(T * 1000);
  });
  it('takes the latest password entry and ignores other methods', () => {
    const amr = [
      { method: 'totp', timestamp: T + 50 },
      { method: 'password', timestamp: T },
      { method: 'password', timestamp: T + 10 },
    ];
    expect(passwordSignInAt(jwt({ amr }))).toBe((T + 10) * 1000);
  });
  it('is null for Google / OAuth, recovery and magic-link sessions', () => {
    for (const method of ['oauth', 'recovery', 'otp', 'magiclink', 'totp']) {
      expect(passwordSignInAt(jwt({ amr: [{ method, timestamp: T }] }))).toBeNull();
    }
  });
  it('is null for anything unreadable or missing', () => {
    expect(passwordSignInAt(null)).toBeNull();
    expect(passwordSignInAt('')).toBeNull();
    expect(passwordSignInAt('nonsense')).toBeNull();
    expect(passwordSignInAt('a.!!!.c')).toBeNull();
    expect(passwordSignInAt(jwt({ sessionFresh: true }))).toBeNull();
    expect(passwordSignInAt(jwt({ amr: 'password' }))).toBeNull();
    expect(passwordSignInAt(jwt({ amr: [{ method: 'password', timestamp: 'soon' }] }))).toBeNull();
  });
});

describe('isAdminSessionFresh', () => {
  const now = 2_000_000_000_000;
  it('is fresh up to 12 hours after the password sign-in, not after', () => {
    expect(isAdminSessionFresh(now, now)).toBe(true);
    expect(isAdminSessionFresh(now - ADMIN_SESSION_MAX_AGE_MS + 60_000, now)).toBe(true);
    expect(isAdminSessionFresh(now - ADMIN_SESSION_MAX_AGE_MS, now)).toBe(false);
    expect(isAdminSessionFresh(now - ADMIN_SESSION_MAX_AGE_MS - 60_000, now)).toBe(false);
  });
  it('is never fresh without a password sign-in', () => {
    expect(isAdminSessionFresh(null, now)).toBe(false);
  });
});

describe('adminAccess', () => {
  it('waits for the profile', () => {
    expect(adminAccess({ profilePending: true, isSuperAdmin: true, sessionFresh: true })).toBe(
      'loading',
    );
  });
  it('hides the area from everyone without the flag, even with a fresh session', () => {
    expect(adminAccess({ profilePending: false, isSuperAdmin: false, sessionFresh: true })).toBe(
      'hidden',
    );
    expect(adminAccess({ profilePending: false, isSuperAdmin: false, sessionFresh: false })).toBe(
      'hidden',
    );
  });
  it('needs a new sign-in for a flagged stale session and grants only flag + fresh', () => {
    expect(adminAccess({ profilePending: false, isSuperAdmin: true, sessionFresh: false })).toBe(
      'needs_reauth',
    );
    expect(adminAccess({ profilePending: false, isSuperAdmin: true, sessionFresh: true })).toBe(
      'granted',
    );
  });
});

describe('adminRedirect', () => {
  it('forces a flagged stale session to sign in again, from anywhere', () => {
    expect(
      adminRedirect({
        access: 'needs_reauth',
        pathname: '/today',
        hasBusiness: true,
        isPasswordRecovery: false,
      }),
    ).toBe(ADMIN_REAUTH);
    expect(
      adminRedirect({
        access: 'needs_reauth',
        pathname: '/login',
        hasBusiness: false,
        isPasswordRecovery: false,
      }),
    ).toBe(ADMIN_REAUTH);
    expect(
      adminRedirect({
        access: 'needs_reauth',
        pathname: ADMIN_REAUTH,
        hasBusiness: false,
        isPasswordRecovery: false,
      }),
    ).toBeNull();
  });
  it('sends a business-less admin to /admin instead of onboarding', () => {
    expect(
      adminRedirect({
        access: 'granted',
        pathname: '/',
        hasBusiness: false,
        isPasswordRecovery: false,
      }),
    ).toBe('/admin');
    expect(
      adminRedirect({
        access: 'granted',
        pathname: '/onboarding',
        hasBusiness: false,
        isPasswordRecovery: false,
      }),
    ).toBe('/admin');
    expect(
      adminRedirect({
        access: 'granted',
        pathname: '/admin/platform',
        hasBusiness: false,
        isPasswordRecovery: false,
      }),
    ).toBeNull();
  });
  it('leaves an admin who owns a business alone, and bounces off the sign-in-again screen once fresh', () => {
    expect(
      adminRedirect({
        access: 'granted',
        pathname: '/today',
        hasBusiness: true,
        isPasswordRecovery: false,
      }),
    ).toBeNull();
    expect(
      adminRedirect({
        access: 'granted',
        pathname: ADMIN_REAUTH,
        hasBusiness: true,
        isPasswordRecovery: false,
      }),
    ).toBe('/admin');
  });
  it('never redirects normal users or while loading', () => {
    expect(
      adminRedirect({
        access: 'hidden',
        pathname: '/',
        hasBusiness: false,
        isPasswordRecovery: false,
      }),
    ).toBeNull();
    expect(
      adminRedirect({
        access: 'loading',
        pathname: '/',
        hasBusiness: false,
        isPasswordRecovery: false,
      }),
    ).toBeNull();
  });

  it('never forces a password-recovery session to sign in again first, from anywhere', () => {
    // A super admin opening a reset link has a recovery session (needs_reauth),
    // but AuthGate is already sending them to /reset-password; forcing the
    // sign-in-again screen first would strand them before the new password.
    expect(
      adminRedirect({
        access: 'needs_reauth',
        pathname: '/reset-password',
        hasBusiness: true,
        isPasswordRecovery: true,
      }),
    ).toBeNull();
    expect(
      adminRedirect({
        access: 'needs_reauth',
        pathname: '/today',
        hasBusiness: true,
        isPasswordRecovery: true,
      }),
    ).toBeNull();
    // Same for a business-less admin and a fully granted one: a recovery
    // session is never redirected by this function at all.
    expect(
      adminRedirect({
        access: 'granted',
        pathname: '/',
        hasBusiness: false,
        isPasswordRecovery: true,
      }),
    ).toBeNull();
  });
});

describe('admin error mapping', () => {
  const RPC_CODES = [
    'forbidden',
    'reauth_required',
    'invalid_input',
    'invalid',
    'not_found',
    'plan_required',
    'over_limit',
    'invalid_plan',
    'invalid_period',
    'invalid_notes',
    'invalid_status',
    'invalid_days',
    'not_extendable',
    'unknown_addon',
    'invalid_amount',
    'insufficient',
    'search_too_short',
    'invalid_cursor',
    'invalid_terminology',
    'invalid_fields',
    'reason_required',
    'already_removed',
  ];
  it('has a message for EVERY code the RPCs return', () => {
    for (const code of RPC_CODES) {
      expect(adminErrorKey(code), code).toBe(
        ADMIN_ERROR_KEYS[code as keyof typeof ADMIN_ERROR_KEYS],
      );
      expect(adminErrorKey(code)).not.toBe(ADMIN_ERROR_KEYS.unknown);
    }
  });
  it('falls back to unknown for anything else', () => {
    expect(adminErrorKey('whatever')).toBe(ADMIN_ERROR_KEYS.unknown);
    expect(adminErrorKey(null)).toBe(ADMIN_ERROR_KEYS.unknown);
    expect(adminErrorKey('toString')).toBe(ADMIN_ERROR_KEYS.unknown);
  });
});

describe('unwrapAdminResult', () => {
  it('returns an ok payload', () => {
    expect(unwrapAdminResult({ ok: true, items: [] }, null)).toEqual({ ok: true, items: [] });
  });
  it('throws the server code', () => {
    expect(() => unwrapAdminResult({ ok: false, code: 'reauth_required' }, null)).toThrow(
      AdminRpcError,
    );
    try {
      unwrapAdminResult({ ok: false, code: 'not_found' }, null);
    } catch (e) {
      expect((e as AdminRpcError).code).toBe('not_found');
    }
  });
  it('maps a missing EXECUTE grant to forbidden and other errors to unknown', () => {
    expect(() => unwrapAdminResult(null, { code: '42501' })).toThrow('forbidden');
    expect(() => unwrapAdminResult(null, { code: '42883' })).toThrow('forbidden');
    expect(() => unwrapAdminResult(null, { code: 'XX000' })).toThrow('unknown');
  });
  it('treats a malformed body as unknown', () => {
    expect(() => unwrapAdminResult(null, null)).toThrow('unknown');
    expect(() => unwrapAdminResult([1], null)).toThrow('unknown');
    expect(() => unwrapAdminResult({ ok: false }, null)).toThrow('unknown');
  });
  it('carries the over_limit detail', () => {
    try {
      unwrapAdminResult(
        {
          ok: false,
          code: 'over_limit',
          staff_over_cap: [{ branch: 'Main', active_staff: 8, cap: 5 }],
          branches_over: { current: 2, max: 1 },
        },
        null,
      );
    } catch (e) {
      expect((e as AdminRpcError).overLimit).toEqual({
        staffOverCap: [{ branch: 'Main', activeStaff: 8, cap: 5 }],
        branchesOver: { current: 2, max: 1 },
      });
    }
  });
});

describe('parseOverLimit', () => {
  it('ignores malformed rows', () => {
    expect(
      parseOverLimit({ staff_over_cap: [null, 3, { branch: 'A' }], branches_over: null }),
    ).toEqual({
      staffOverCap: [],
      branchesOver: null,
    });
  });
});
