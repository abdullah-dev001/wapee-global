/** The route that handles an invite link. */
export const INVITE_PATH = '/accept-invite';

/**
 * The in-app path for an invite link, e.g. `/accept-invite?token=…`.
 *
 * Kept free of any react-native import (unlike `inviteUrl.ts`) so it can be
 * unit-tested directly in Node — it is also what `emailRedirectTo` is built
 * from when a signup must return to a pending invite after email confirmation.
 */
export function inviteAcceptPath(token: string): string {
  return `${INVITE_PATH}?token=${encodeURIComponent(token)}`;
}
