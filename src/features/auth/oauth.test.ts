import { describe, expect, it } from 'vitest';

import {
  isGoogleSignInAvailable,
  OAUTH_ERROR_KEYS,
  oauthErrorKey,
  readOAuthCallbackError,
} from './oauth';

describe('isGoogleSignInAvailable', () => {
  it('is offered on the web and in an installed Android / desktop PWA', () => {
    expect(isGoogleSignInAvailable({ os: 'web', isIOS: false, isStandalone: false })).toBe(true);
    expect(isGoogleSignInAvailable({ os: 'web', isIOS: false, isStandalone: true })).toBe(true);
  });

  it('is offered in iOS Safari (a normal tab)', () => {
    expect(isGoogleSignInAvailable({ os: 'web', isIOS: true, isStandalone: false })).toBe(true);
  });

  it('is hidden in an installed iOS PWA (the session would land in the wrong storage)', () => {
    expect(isGoogleSignInAvailable({ os: 'web', isIOS: true, isStandalone: true })).toBe(false);
  });

  it('is never offered in the native apps', () => {
    expect(isGoogleSignInAvailable({ os: 'ios', isIOS: true, isStandalone: false })).toBe(false);
    expect(isGoogleSignInAvailable({ os: 'android', isIOS: false, isStandalone: false })).toBe(
      false,
    );
  });
});

describe('readOAuthCallbackError', () => {
  it('returns null for a successful redirect (tokens, no error)', () => {
    expect(
      readOAuthCallbackError('http://localhost:8090/auth/callback#access_token=a&refresh_token=b'),
    ).toBeNull();
    expect(readOAuthCallbackError('http://localhost:8090/auth/callback')).toBeNull();
  });

  it('reads an error from the fragment (implicit flow)', () => {
    expect(
      readOAuthCallbackError(
        'https://wapee.online/auth/callback#error=access_denied&error_code=403&error_description=The+user+denied',
      ),
    ).toEqual({ error: 'access_denied', code: '403', description: 'The user denied' });
  });

  it('reads an error from the query string', () => {
    expect(
      readOAuthCallbackError(
        'https://wapee.online/auth/callback?error=server_error&error_description=Something%20broke',
      ),
    ).toEqual({ error: 'server_error', code: null, description: 'Something broke' });
  });

  it('never throws on a malformed address', () => {
    expect(readOAuthCallbackError('not a url')).toBeNull();
  });
});

describe('oauthErrorKey', () => {
  it('maps a refused / closed Google screen to "cancelled"', () => {
    expect(oauthErrorKey({ error: 'access_denied', code: null, description: null })).toBe(
      OAUTH_ERROR_KEYS.cancelled,
    );
  });

  it('maps the suspended-business hook refusal to the account-disabled message', () => {
    expect(
      oauthErrorKey({
        error: 'server_error',
        code: 'unexpected_failure',
        description: 'This account is disabled. Contact support@wapee.online',
      }),
    ).toBe(OAUTH_ERROR_KEYS.disabled);
  });

  it('never shows provider text: everything else is the generic failure', () => {
    expect(
      oauthErrorKey({ error: 'server_error', code: null, description: 'Unable to exchange code' }),
    ).toBe(OAUTH_ERROR_KEYS.failed);
    expect(
      oauthErrorKey({ error: 'access_denied', code: null, description: 'Error running hook URI' }),
    ).toBe(OAUTH_ERROR_KEYS.failed);
  });
});
