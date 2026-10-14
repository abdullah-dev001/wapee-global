import { describe, expect, it } from 'vitest';

import {
  ADMIN_2FA,
  ADMIN_ERROR_KEYS,
  AdminRpcError,
  aalFromAccessToken,
  adminAccess,
  adminErrorKey,
  adminRedirect,
  formatTotpSecret,
  isTotpCodeComplete,
  normaliseTotpCode,
  parseOverLimit,
  qrSvgFromDataUri,
  unwrapAdminResult,
} from './adminLogic';

function jwt(payload: object): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('aalFromAccessToken', () => {
  it('reads aal2 and aal1', () => {
    expect(aalFromAccessToken(jwt({ aal: 'aal2' }))).toBe('aal2');
    expect(aalFromAccessToken(jwt({ aal: 'aal1' }))).toBe('aal1');
  });
  it('is aal1 for anything unreadable or missing', () => {
    expect(aalFromAccessToken(null)).toBe('aal1');
    expect(aalFromAccessToken('')).toBe('aal1');
    expect(aalFromAccessToken('nonsense')).toBe('aal1');
    expect(aalFromAccessToken('a.!!!.c')).toBe('aal1');
    expect(aalFromAccessToken(jwt({ sub: 'x' }))).toBe('aal1');
    expect(aalFromAccessToken(jwt({ aal: 'AAL2' }))).toBe('aal1');
  });
});

describe('TOTP helpers', () => {
  it('keeps six digits only', () => {
    expect(normaliseTotpCode('123 456')).toBe('123456');
    expect(normaliseTotpCode('12ab34-56789')).toBe('123456');
    expect(normaliseTotpCode('')).toBe('');
  });
  it('knows when a code is complete', () => {
    expect(isTotpCodeComplete('123456')).toBe(true);
    expect(isTotpCodeComplete('12345')).toBe(false);
    expect(isTotpCodeComplete('12345a')).toBe(false);
  });
  it('extracts the svg from the data uri, plain or percent-encoded', () => {
    expect(qrSvgFromDataUri('data:image/svg+xml;utf-8,<svg xmlns="x"></svg>')).toBe(
      '<svg xmlns="x"></svg>',
    );
    expect(qrSvgFromDataUri('data:image/svg+xml;utf-8,%3Csvg%20a%3D%221%22%3E%3C%2Fsvg%3E')).toBe(
      '<svg a="1"></svg>',
    );
    expect(qrSvgFromDataUri('data:text/plain,hello')).toBeNull();
    expect(qrSvgFromDataUri('<svg></svg>')).toBeNull();
    expect(qrSvgFromDataUri('data:image/svg+xml,%E0%A4%A')).toBeNull();
    expect(qrSvgFromDataUri('data:image/svg+xml,<div></div>')).toBeNull();
  });
  it('groups the secret in fours', () => {
    expect(formatTotpSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});

describe('adminAccess', () => {
  it('waits for the profile', () => {
    expect(adminAccess({ profilePending: true, isSuperAdmin: true, aal: 'aal2' })).toBe('loading');
  });
  it('hides the area from everyone without the flag, even at aal2', () => {
    expect(adminAccess({ profilePending: false, isSuperAdmin: false, aal: 'aal2' })).toBe('hidden');
    expect(adminAccess({ profilePending: false, isSuperAdmin: false, aal: 'aal1' })).toBe('hidden');
  });
  it('needs 2FA for a flagged aal1 session and grants only flag + aal2', () => {
    expect(adminAccess({ profilePending: false, isSuperAdmin: true, aal: 'aal1' })).toBe(
      'needs_2fa',
    );
    expect(adminAccess({ profilePending: false, isSuperAdmin: true, aal: 'aal2' })).toBe('granted');
  });
});

describe('adminRedirect', () => {
  it('forces a flagged aal1 user to the 2FA screen, from anywhere', () => {
    expect(
      adminRedirect({
        access: 'needs_2fa',
        pathname: '/today',
        hasBusiness: true,
        isPasswordRecovery: false,
      }),
    ).toBe(ADMIN_2FA);
    expect(
      adminRedirect({
        access: 'needs_2fa',
        pathname: '/login',
        hasBusiness: false,
        isPasswordRecovery: false,
      }),
    ).toBe(ADMIN_2FA);
    expect(
      adminRedirect({
        access: 'needs_2fa',
        pathname: ADMIN_2FA,
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
  it('leaves an admin who owns a business alone, and bounces off the 2FA screen once done', () => {
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
        pathname: ADMIN_2FA,
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

  it('never forces a password-recovery session through the 2FA screen, from anywhere — the production bug this guards against', () => {
    // A 2FA-enrolled super admin opening a reset link is aal1 (needs_2fa) until
    // they verify, exactly like signing in — but AuthGate is already sending
    // them to /reset-password, and forcing /admin/2fa here first would strand
    // them with no way back to actually resetting the password.
    expect(
      adminRedirect({
        access: 'needs_2fa',
        pathname: '/reset-password',
        hasBusiness: true,
        isPasswordRecovery: true,
      }),
    ).toBeNull();
    expect(
      adminRedirect({
        access: 'needs_2fa',
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
    'mfa_required',
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
    expect(() => unwrapAdminResult({ ok: false, code: 'mfa_required' }, null)).toThrow(
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
