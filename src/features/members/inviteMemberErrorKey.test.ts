import { describe, expect, it } from 'vitest';

import { INVITE_MEMBER_ERROR_KEYS, inviteMemberErrorKey } from './inviteMemberErrorKey';

function errorWithCode(code: string): Error {
  const error = new Error('raw db text') as Error & { code?: string };
  error.code = code;
  return error;
}

describe('inviteMemberErrorKey', () => {
  it('maps 42501 (not signed in / no permission) to forbidden', () => {
    expect(inviteMemberErrorKey(errorWithCode('42501'))).toBe(INVITE_MEMBER_ERROR_KEYS.forbidden);
  });

  it('maps 22023 (invalid email/role/branch/staff) to invalidInput', () => {
    expect(inviteMemberErrorKey(errorWithCode('22023'))).toBe(
      INVITE_MEMBER_ERROR_KEYS.invalidInput,
    );
  });

  it('maps 23505 (already a member / staff already has a login) to alreadyMember', () => {
    expect(inviteMemberErrorKey(errorWithCode('23505'))).toBe(
      INVITE_MEMBER_ERROR_KEYS.alreadyMember,
    );
  });

  it('falls back to unknown for an unrecognised code', () => {
    expect(inviteMemberErrorKey(errorWithCode('99999'))).toBe(INVITE_MEMBER_ERROR_KEYS.unknown);
  });

  it('falls back to unknown for a plain Error with no code', () => {
    expect(inviteMemberErrorKey(new Error('boom'))).toBe(INVITE_MEMBER_ERROR_KEYS.unknown);
  });

  it('falls back to unknown for non-Error input', () => {
    expect(inviteMemberErrorKey(null)).toBe(INVITE_MEMBER_ERROR_KEYS.unknown);
    expect(inviteMemberErrorKey(undefined)).toBe(INVITE_MEMBER_ERROR_KEYS.unknown);
    expect(inviteMemberErrorKey('a string')).toBe(INVITE_MEMBER_ERROR_KEYS.unknown);
  });
});
