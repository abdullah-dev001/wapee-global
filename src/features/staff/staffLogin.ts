import { rpcCode } from '@/lib/supabase/rpcResult';

import { type StaffListItem } from './api/useStaff';

/** The Select value for "no app login". */
export const NO_LOGIN = 'none';

/** The slice of a team member the login picker needs (a `MemberRow` satisfies it). */
export type LoginMember = {
  id: string;
  status: string;
  fullName: string | null;
  email: string | null;
  roles: { roleName: string }[];
};

export type LoginOption = { value: string; label: string; hint?: string };

/**
 * The options of the staff form's "Login" field: "no login" + every live member of the business
 * (active or invited) that is not already the login of ANOTHER profile. The member currently
 * linked to the profile being edited stays in the list.
 */
export function loginOptions(input: {
  members: readonly LoginMember[];
  staff: readonly Pick<StaffListItem, 'id' | 'memberId'>[];
  currentStaffId: string | null;
  noLoginLabel: string;
  pendingLabel: string;
  unnamedLabel: string;
}): LoginOption[] {
  const takenByOthers = new Set(
    input.staff
      .filter((entry) => entry.memberId !== null && entry.id !== input.currentStaffId)
      .map((entry) => entry.memberId),
  );

  const options = input.members
    .filter((m) => (m.status === 'active' || m.status === 'invited') && !takenByOthers.has(m.id))
    .map((m) => {
      const name = m.fullName?.trim() || m.email || input.unnamedLabel;
      const roles = m.roles.map((role) => role.roleName).filter(Boolean);
      const detail = [m.fullName && m.email ? m.email : null, roles.join(', ') || null]
        .filter(Boolean)
        .join(' · ');
      return {
        value: m.id,
        label: m.status === 'invited' ? `${name} (${input.pendingLabel})` : name,
        ...(detail ? { hint: detail } : {}),
      };
    });

  return [{ value: NO_LOGIN, label: input.noLoginLabel }, ...options];
}

const LINK_ERROR_KEYS = {
  member_already_linked: 'staff.login.errors.memberAlreadyLinked',
  member_not_found: 'staff.login.errors.memberNotFound',
  forbidden: 'staff.login.errors.forbidden',
  not_found: 'staff.login.errors.notFound',
  already_staff: 'staff.login.errors.alreadyStaff',
  branch_not_found: 'staff.login.errors.branchNotFound',
} as const;

/** i18n key for a code returned by `link_staff_member` / `add_me_as_staff`, or null. */
export function linkErrorKey(
  error: unknown,
): (typeof LINK_ERROR_KEYS)[keyof typeof LINK_ERROR_KEYS] | null {
  const code = rpcCode(error);
  if (code && code in LINK_ERROR_KEYS) {
    return LINK_ERROR_KEYS[code as keyof typeof LINK_ERROR_KEYS];
  }
  return null;
}

const ARCHIVE_ERROR_KEYS = {
  future_appointments: 'staff.archiveErrors.futureAppointments',
  not_found: 'staff.archiveErrors.notFound',
  forbidden: 'staff.archiveErrors.forbidden',
} as const;

/** i18n key for a code returned by `archive_staff`, or null. */
export function archiveErrorKey(
  error: unknown,
): (typeof ARCHIVE_ERROR_KEYS)[keyof typeof ARCHIVE_ERROR_KEYS] | null {
  const code = rpcCode(error);
  if (code && code in ARCHIVE_ERROR_KEYS) {
    return ARCHIVE_ERROR_KEYS[code as keyof typeof ARCHIVE_ERROR_KEYS];
  }
  return null;
}

/**
 * Last-resort i18n key for any staff-screen error that isn't a plan refusal, a
 * login-link refusal or an archive refusal (a generic `42501`, a transient
 * failure, ...) — the final fallback before raw server text, same reasoning as
 * `serviceErrorKey` (CLAUDE.md: zero hard-coded user strings, errors through
 * mapper keys).
 */
export function staffErrorKey(error: unknown): 'staff.errors.forbidden' | 'staff.errors.unknown' {
  const e = error as { code?: string | null } | null;
  return e && typeof e === 'object' && e.code === '42501'
    ? 'staff.errors.forbidden'
    : 'staff.errors.unknown';
}

/**
 * The profile, branches and services WERE saved, but linking the login was refused. Carries the
 * saved profile id so the form can keep working on that profile (a retry must not create a second
 * one) and the underlying reason so the screen can name it.
 */
export class StaffLinkError extends Error {
  readonly staffId: string;
  override readonly cause: unknown;

  constructor(staffId: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'link_failed');
    this.name = 'StaffLinkError';
    this.staffId = staffId;
    this.cause = cause;
  }
}
