/**
 * `invite_member` raises (Postgres errcodes), unlike the Phase 9B member-admin
 * RPCs which return `{ok:false,code}` (mapped by `roleErrorKey` in
 * `src/features/roles/rolesLogic.ts`) — a different code space, so it needs its
 * own small mapper. Pure, no react-native import, so it is unit-testable
 * directly (same reasoning as `authErrorKey.ts` / `adminLogic.ts`). Branches on
 * the stable `code`, never the raw message (CLAUDE.md: zero hard-coded user
 * strings).
 */

export const INVITE_MEMBER_ERROR_KEYS = {
  forbidden: 'members.errors.forbidden',
  invalidInput: 'members.errors.invalidInput',
  alreadyMember: 'members.errors.alreadyMember',
  unknown: 'members.errors.unknown',
} as const;

export function inviteMemberErrorKey(
  error: unknown,
): (typeof INVITE_MEMBER_ERROR_KEYS)[keyof typeof INVITE_MEMBER_ERROR_KEYS] {
  const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  switch (code) {
    case '42501':
      return INVITE_MEMBER_ERROR_KEYS.forbidden;
    case '22023':
      return INVITE_MEMBER_ERROR_KEYS.invalidInput;
    case '23505':
      return INVITE_MEMBER_ERROR_KEYS.alreadyMember;
    default:
      return INVITE_MEMBER_ERROR_KEYS.unknown;
  }
}
