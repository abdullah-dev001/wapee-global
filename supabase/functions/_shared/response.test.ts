import { describe, expect, it } from 'vitest';

import { jsonError, toPublicCode } from './response.ts';

describe('toPublicCode', () => {
  it('maps email_required to its own public code (not server_error)', () => {
    expect(toPublicCode('email_required')).toBe('email_required');
  });

  it('still collapses an unknown code to server_error', () => {
    expect(toPublicCode('something_new')).toBe('server_error');
  });
});

describe('jsonError', () => {
  it('returns email_required as a 400 with the code in the body', async () => {
    const res = jsonError(new Request('https://example.test/'), 'email_required');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, code: 'email_required' });
  });
});
