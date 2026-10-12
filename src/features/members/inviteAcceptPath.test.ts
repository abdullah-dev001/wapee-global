import { describe, expect, it } from 'vitest';

import { inviteAcceptPath } from './inviteAcceptPath';

describe('inviteAcceptPath', () => {
  it('builds the accept-invite path with the token as a query param', () => {
    expect(inviteAcceptPath('abc123')).toBe('/accept-invite?token=abc123');
  });

  it('encodes characters that would otherwise break the query string', () => {
    // Tokens are opaque strings; nothing about them should be assumed URL-safe.
    expect(inviteAcceptPath('a b&c=d')).toBe('/accept-invite?token=a%20b%26c%3Dd');
  });

  it('is the exact path used as emailRedirectTo so a confirmed signup returns with the token intact', () => {
    const path = inviteAcceptPath('tok-1');
    const url = new URL(path, 'https://example.test');
    expect(url.pathname).toBe('/accept-invite');
    expect(url.searchParams.get('token')).toBe('tok-1');
  });
});
