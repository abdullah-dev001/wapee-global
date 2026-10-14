import { describe, expect, it } from 'vitest';

import { AUTH_ERROR_KEYS, authErrorKey } from './authErrorKey';

describe('authErrorKey', () => {
  it('maps invalid_credentials', () => {
    expect(authErrorKey({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      AUTH_ERROR_KEYS.invalidCredentials,
    );
  });

  it('maps email_not_confirmed', () => {
    expect(authErrorKey({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(
      AUTH_ERROR_KEYS.emailNotConfirmed,
    );
  });

  it('maps email_exists and user_already_exists to alreadyRegistered', () => {
    expect(authErrorKey({ code: 'email_exists', message: 'User already registered' })).toBe(
      AUTH_ERROR_KEYS.alreadyRegistered,
    );
    expect(authErrorKey({ code: 'user_already_exists', message: 'User already registered' })).toBe(
      AUTH_ERROR_KEYS.alreadyRegistered,
    );
  });

  it('maps weak_password', () => {
    expect(authErrorKey({ code: 'weak_password', message: 'Password is too weak' })).toBe(
      AUTH_ERROR_KEYS.weakPassword,
    );
  });

  it('maps every rate-limit code to rateLimited', () => {
    expect(authErrorKey({ code: 'over_email_send_rate_limit', message: 'rate limit' })).toBe(
      AUTH_ERROR_KEYS.rateLimited,
    );
    expect(authErrorKey({ code: 'over_request_rate_limit', message: 'rate limit' })).toBe(
      AUTH_ERROR_KEYS.rateLimited,
    );
    expect(authErrorKey({ code: 'over_sms_send_rate_limit', message: 'rate limit' })).toBe(
      AUTH_ERROR_KEYS.rateLimited,
    );
  });

  it('maps a bare HTTP 429 (no recognised code) to rateLimited', () => {
    expect(authErrorKey({ status: 429, message: 'Too Many Requests' })).toBe(
      AUTH_ERROR_KEYS.rateLimited,
    );
  });

  it('maps expired/used link codes to expiredLink', () => {
    expect(authErrorKey({ code: 'otp_expired', message: 'Token has expired' })).toBe(
      AUTH_ERROR_KEYS.expiredLink,
    );
    expect(authErrorKey({ code: 'flow_state_expired', message: 'Flow expired' })).toBe(
      AUTH_ERROR_KEYS.expiredLink,
    );
    expect(authErrorKey({ code: 'flow_state_not_found', message: 'Flow not found' })).toBe(
      AUTH_ERROR_KEYS.expiredLink,
    );
  });

  it('maps the create_business_with_owner slug-taken Postgres errcode', () => {
    expect(authErrorKey({ code: '23514', message: 'That address is not available' })).toBe(
      AUTH_ERROR_KEYS.slugTaken,
    );
  });

  it('maps a network failure message when no code is present', () => {
    expect(authErrorKey({ message: 'Network request failed' })).toBe(AUTH_ERROR_KEYS.network);
    expect(authErrorKey({ message: 'TypeError: Failed to fetch' })).toBe(AUTH_ERROR_KEYS.network);
  });

  it('falls back to generic for an unrecognised code', () => {
    expect(authErrorKey({ code: 'some_future_code', message: 'anything' })).toBe(
      AUTH_ERROR_KEYS.generic,
    );
  });

  it('falls back to generic for a plain Error with no code', () => {
    expect(authErrorKey(new Error('boom'))).toBe(AUTH_ERROR_KEYS.generic);
  });

  it('falls back to generic for non-Error input', () => {
    expect(authErrorKey(null)).toBe(AUTH_ERROR_KEYS.generic);
    expect(authErrorKey(undefined)).toBe(AUTH_ERROR_KEYS.generic);
    expect(authErrorKey('a string')).toBe(AUTH_ERROR_KEYS.generic);
    expect(authErrorKey(42)).toBe(AUTH_ERROR_KEYS.generic);
    expect(authErrorKey({})).toBe(AUTH_ERROR_KEYS.generic);
  });
});
