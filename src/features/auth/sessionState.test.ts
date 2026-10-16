import { type Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { nextSessionState } from './sessionState';

function makeSession(userId: string, token = 'token-1'): Session {
  return { access_token: token, user: { id: userId } } as unknown as Session;
}

describe('nextSessionState', () => {
  it('keeps the cache and the session object on a same-user SIGNED_IN (tab refocus)', () => {
    const previous = makeSession('u1');
    const result = nextSessionState('SIGNED_IN', previous, makeSession('u1'), false);
    expect(result.clearCache).toBe(false);
    expect(result.session).toBe(previous);
  });

  it('keeps the cache on TOKEN_REFRESHED for the same user and exposes the new token', () => {
    const next = makeSession('u1', 'token-2');
    const result = nextSessionState('TOKEN_REFRESHED', makeSession('u1'), next, false);
    expect(result.clearCache).toBe(false);
    expect(result.session).toBe(next);
  });

  it('clears the cache when a different user signs in', () => {
    const result = nextSessionState('SIGNED_IN', makeSession('u1'), makeSession('u2'), false);
    expect(result.clearCache).toBe(true);
  });

  it('clears the cache on the first sign-in after being signed out', () => {
    const result = nextSessionState('SIGNED_IN', null, makeSession('u1'), false);
    expect(result.clearCache).toBe(true);
  });

  it('clears the cache on sign-out', () => {
    const result = nextSessionState('SIGNED_OUT', makeSession('u1'), null, false);
    expect(result.clearCache).toBe(true);
    expect(result.session).toBeNull();
  });

  it('does not clear when the initial session event matches the stored one', () => {
    const previous = makeSession('u1');
    const result = nextSessionState('INITIAL_SESSION', previous, makeSession('u1'), false);
    expect(result.clearCache).toBe(false);
  });

  describe('isPasswordRecovery', () => {
    it('turns on for the PASSWORD_RECOVERY event', () => {
      const result = nextSessionState('PASSWORD_RECOVERY', null, makeSession('u1'), false);
      expect(result.isPasswordRecovery).toBe(true);
    });

    it('stays on through a same-user SIGNED_IN (tab refocus) while the reset form is open', () => {
      const previous = makeSession('u1');
      const result = nextSessionState('SIGNED_IN', previous, makeSession('u1'), true);
      expect(result.isPasswordRecovery).toBe(true);
    });

    it('stays on through TOKEN_REFRESHED while the reset form is open', () => {
      const result = nextSessionState(
        'TOKEN_REFRESHED',
        makeSession('u1'),
        makeSession('u1', 'token-2'),
        true,
      );
      expect(result.isPasswordRecovery).toBe(true);
    });

    it('turns off once the password is actually saved (USER_UPDATED)', () => {
      const result = nextSessionState('USER_UPDATED', makeSession('u1'), makeSession('u1'), true);
      expect(result.isPasswordRecovery).toBe(false);
    });

    it('turns off on sign-out', () => {
      const result = nextSessionState('SIGNED_OUT', makeSession('u1'), null, true);
      expect(result.isPasswordRecovery).toBe(false);
    });

    it('stays off for an ordinary sign-in that never went through recovery', () => {
      const result = nextSessionState('SIGNED_IN', null, makeSession('u1'), false);
      expect(result.isPasswordRecovery).toBe(false);
    });
  });
});
