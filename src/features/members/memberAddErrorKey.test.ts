import { describe, expect, it } from 'vitest';

import { RpcError } from '@/lib/supabase/rpcResult';

import { MEMBER_ADD_ERROR_KEYS, memberAddErrorKey } from './memberAddErrorKey';

describe('memberAddErrorKey', () => {
  it('maps every code add_member_by_email can return', () => {
    expect(memberAddErrorKey(new RpcError('forbidden'))).toBe('members.errors.forbidden');
    expect(memberAddErrorKey(new RpcError('rate_limited'))).toBe('members.errors.rateLimited');
    expect(memberAddErrorKey(new RpcError('invalid_email'))).toBe('members.errors.invalidEmail');
    expect(memberAddErrorKey(new RpcError('unknown_role'))).toBe('members.errors.invalidInput');
    expect(memberAddErrorKey(new RpcError('unknown_branch'))).toBe('members.errors.invalidInput');
    expect(memberAddErrorKey(new RpcError('unknown_staff'))).toBe('members.errors.invalidInput');
    expect(memberAddErrorKey(new RpcError('feature_unavailable'))).toBe(
      'members.errors.featureUnavailable',
    );
    expect(memberAddErrorKey(new RpcError('cannot_grant'))).toBe('members.errors.cannotGrant');
    expect(memberAddErrorKey(new RpcError('cannot_modify_higher_role'))).toBe(
      'members.errors.cannotGrant',
    );
    expect(memberAddErrorKey(new RpcError('already_member'))).toBe('members.errors.alreadyMember');
    expect(memberAddErrorKey(new RpcError('staff_has_login'))).toBe('members.errors.staffHasLogin');
  });

  it('falls back to unknown for anything else', () => {
    expect(memberAddErrorKey(new RpcError('something_new'))).toBe(MEMBER_ADD_ERROR_KEYS.unknown);
    expect(memberAddErrorKey(new Error('transport failure'))).toBe(MEMBER_ADD_ERROR_KEYS.unknown);
    expect(memberAddErrorKey(null)).toBe(MEMBER_ADD_ERROR_KEYS.unknown);
    expect(memberAddErrorKey('a string')).toBe(MEMBER_ADD_ERROR_KEYS.unknown);
  });

  it('never maps a prototype key', () => {
    expect(memberAddErrorKey(new RpcError('toString'))).toBe(MEMBER_ADD_ERROR_KEYS.unknown);
  });
});
