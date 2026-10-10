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
