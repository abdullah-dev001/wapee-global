/**
 * `add_member_by_email` returns `{ok:false, code}` (it is rate-limited, so it never raises after
 * counting the attempt). This maps those codes to i18n keys. Pure, no react-native import, so it
 * is unit-testable directly (same reasoning as `authErrorKey.ts`). Branches on the stable code,
 * never a message (CLAUDE.md: zero hard-coded user strings).
 */

import { rpcCode } from '@/lib/supabase/rpcResult';

export const MEMBER_ADD_ERROR_KEYS = {
  forbidden: 'members.errors.forbidden',
  rate_limited: 'members.errors.rateLimited',
  invalid_email: 'members.errors.invalidEmail',
  unknown_role: 'members.errors.invalidInput',
  unknown_branch: 'members.errors.invalidInput',
  unknown_staff: 'members.errors.invalidInput',
  feature_unavailable: 'members.errors.featureUnavailable',
  cannot_grant: 'members.errors.cannotGrant',
  cannot_modify_higher_role: 'members.errors.cannotGrant',
  already_member: 'members.errors.alreadyMember',
  staff_has_login: 'members.errors.staffHasLogin',
  unknown: 'members.errors.unknown',
} as const;

export type MemberAddErrorKey = (typeof MEMBER_ADD_ERROR_KEYS)[keyof typeof MEMBER_ADD_ERROR_KEYS];

export function memberAddErrorKey(error: unknown): MemberAddErrorKey {
  const code = rpcCode(error);
  if (code && Object.prototype.hasOwnProperty.call(MEMBER_ADD_ERROR_KEYS, code)) {
    return MEMBER_ADD_ERROR_KEYS[code as keyof typeof MEMBER_ADD_ERROR_KEYS];
  }
  return MEMBER_ADD_ERROR_KEYS.unknown;
}
