import { create } from 'zustand';

/** What the Auth hook returns when sign-in is refused (matched case-insensitively). */
const DISABLED_MESSAGE = /account is disabled/i;

export function isAccountDisabledError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && DISABLED_MESSAGE.test(error.message));
}

type DisabledNoticeState = {
  /** True after a session was ended because the account is disabled; the login screen shows the message. */
  visible: boolean;
  show: () => void;
  clear: () => void;
};

/** Client-only UI state: carries "you were signed out because the account is disabled" to the login screen. */
export const useDisabledNotice = create<DisabledNoticeState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  clear: () => set({ visible: false }),
}));
