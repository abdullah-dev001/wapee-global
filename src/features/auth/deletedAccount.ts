import { create } from 'zustand';

/**
 * `businesses.created_by` references `profiles(id)` (which itself cascades
 * from `auth.users`). A JWT stays cryptographically valid for its own
 * lifetime even after the user row behind it is gone (deleting a user does
 * not revoke an already-issued access token), so a stale browser tab can
 * still call a write RPC as a UUID with no matching profile any more —
 * `create_business_with_owner`'s insert into `businesses` is exactly such a
 * write, and fails with this foreign-key violation rather than a clean
 * "you are signed out" error.
 */
const DELETED_USER_CONSTRAINT = /businesses_created_by_fkey/i;

export function isDeletedUserError(
  error:
    { code?: string | null; message?: string | null; details?: string | null } | null | undefined,
): boolean {
  if (!error || error.code !== '23503') return false;
  return (
    DELETED_USER_CONSTRAINT.test(error.message ?? '') ||
    DELETED_USER_CONSTRAINT.test(error.details ?? '')
  );
}

type DeletedAccountNoticeState = {
  /** True after a session was ended because the underlying account no longer exists; the login screen shows the message. */
  visible: boolean;
  show: () => void;
  clear: () => void;
};

/** Client-only UI state: carries "your account no longer exists" to the login screen, same shape as `useDisabledNotice`. */
export const useDeletedAccountNotice = create<DeletedAccountNoticeState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  clear: () => set({ visible: false }),
}));
