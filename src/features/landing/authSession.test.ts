import { describe, expect, it } from 'vitest';

import { MAX_NAME_LENGTH, readSignedIn, readStoredSession, truncateName } from './authSession';

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const inOneHour = NOW / 1000 + 3600;

/** Shaped like what supabase-js v2 stores under sb-<ref>-auth-token. */
function session(over: Record<string, unknown> = {}, user: Record<string, unknown> = {}): string {
  return JSON.stringify({
    access_token: 'header.payload.signature',
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: inOneHour,
    user: {
      id: 'u1',
      email: 'ada.lovelace@example.com',
      user_metadata: { full_name: 'Ada Lovelace' },
      ...user,
    },
    ...over,
  });
}

function storage(entries: Record<string, string>) {
  return { getItem: (k: string) => (k in entries ? (entries[k] ?? null) : null) };
}

describe('readSignedIn', () => {
  it('valid session: signed in with the full name', () => {
    expect(readSignedIn(session(), NOW)).toEqual({ name: 'Ada Lovelace' });
  });

  it('falls back to user_metadata.name, then the email before "@"', () => {
    expect(readSignedIn(session({}, { user_metadata: { name: 'Ada L' } }), NOW)).toEqual({
      name: 'Ada L',
    });
    expect(readSignedIn(session({}, { user_metadata: {} }), NOW)).toEqual({ name: 'ada.lovelace' });
    expect(readSignedIn(session({}, { user_metadata: { full_name: '   ' } }), NOW)).toEqual({
      name: 'ada.lovelace',
    });
  });

  it('a valid session with no name and no email is still signed in (generic label)', () => {
    expect(readSignedIn(session({}, { email: undefined, user_metadata: {} }), NOW)).toEqual({
      name: null,
    });
  });

  it('long names are truncated with an ellipsis', () => {
    const r = readSignedIn(
      session({}, { user_metadata: { full_name: 'Bartholomew Montgomery-Smythe' } }),
      NOW,
    );
    expect(r?.name).toBe('Bartholomew Montg…');
    expect(Array.from(r?.name ?? '')).toHaveLength(MAX_NAME_LENGTH);
  });

  it('expired session = signed out, even with a refresh token', () => {
    expect(readSignedIn(session({ expires_at: NOW / 1000 - 1 }), NOW)).toBeNull();
    expect(readSignedIn(session({ expires_at: NOW / 1000 }), NOW)).toBeNull();
  });

  it('malformed or incomplete values = signed out, never a throw', () => {
    for (const raw of [null, '', '{', 'null', '[]', '"text"', JSON.stringify({ user: {} })]) {
      expect(readSignedIn(raw, NOW)).toBeNull();
    }
    expect(readSignedIn(session({ access_token: '' }), NOW)).toBeNull();
    expect(readSignedIn(session({ expires_at: 'soon' }), NOW)).toBeNull();
    expect(readSignedIn('base64-%%%', NOW)).toBeNull();
  });

  it('tolerates the @supabase/ssr base64 form and the { currentSession } wrapper', () => {
    const b64 = `base64-${btoa(String.fromCharCode(...new TextEncoder().encode(session())))}`;
    expect(readSignedIn(b64, NOW)).toEqual({ name: 'Ada Lovelace' });
    expect(readSignedIn(JSON.stringify({ currentSession: JSON.parse(session()) }), NOW)).toEqual({
      name: 'Ada Lovelace',
    });
  });
});

describe('readStoredSession', () => {
  const key = 'sb-ref-auth-token';

  it('reads the key, else joins its chunks .0, .1, ...', () => {
    const whole = session();
    expect(readStoredSession(storage({ [key]: whole }), key)).toBe(whole);
    const chunks = storage({ [`${key}.0`]: whole.slice(0, 40), [`${key}.1`]: whole.slice(40) });
    expect(readStoredSession(chunks, key)).toBe(whole);
    expect(readStoredSession(storage({}), key)).toBeNull();
  });

  it('a storage that throws (blocked / private mode) = no session', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readStoredSession(throwing, key)).toBeNull();
  });
});

describe('truncateName', () => {
  it('keeps short names and counts characters, not UTF-16 units', () => {
    expect(truncateName('Zoë')).toBe('Zoë');
    expect(truncateName('😀'.repeat(20))).toBe(`${'😀'.repeat(17)}…`);
  });
});
