import { describe, expect, it } from 'vitest';

import { accountErrorKey, authErrorCode, emailsMatch } from './accountLogic';

describe('accountErrorKey', () => {
  it('maps known codes and falls back for unknown ones', () => {
    expect(accountErrorKey('sole_owner')).toBe('account.errors.sole_owner');
    expect(accountErrorKey('wrong_password')).toBe('account.errors.wrong_password');
    expect(accountErrorKey('nope')).toBe('account.errors.unknown');
    expect(accountErrorKey(null)).toBe('account.errors.unknown');
    expect(accountErrorKey('toString')).toBe('account.errors.unknown');
  });
});

describe('authErrorCode', () => {
  it('reads the Supabase code, then the status', () => {
    expect(authErrorCode({ code: 'same_password' })).toBe('same_password');
    expect(authErrorCode({ code: 'email_exists' })).toBe('email_exists');
    expect(authErrorCode({ code: 'over_email_send_rate_limit' })).toBe('rate_limited');
    expect(authErrorCode({ status: 429 })).toBe('rate_limited');
    expect(authErrorCode({ code: 'x' })).toBe('unknown');
  });
});

describe('emailsMatch', () => {
  it('ignores case and surrounding spaces, never matches empty', () => {
    expect(emailsMatch(' Sam@Example.com ', 'sam@example.com')).toBe(true);
    expect(emailsMatch('sam@example.org', 'sam@example.com')).toBe(false);
    expect(emailsMatch('', '')).toBe(false);
  });
});
