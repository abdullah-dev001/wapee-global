import { type Session } from '@supabase/supabase-js';

export type SessionTransition = {
  /** The session object to expose. The previous object is kept when nothing
   *  visible changed, so context consumers do not re-render for no reason. */
  session: Session | null;
  /** Drop the whole query cache: the signed-in user changed, or signed out. */
  clearCache: boolean;
  /**
   * Opening a password-recovery email link signs the user in via a distinct
   * `PASSWORD_RECOVERY` event. The gates read this to force the session onto
   * `/reset-password` instead of wherever it would otherwise send a signed-in
   * user (home, the admin sign-in-again screen, …) — see gateSettled.ts.
   */
  isPasswordRecovery: boolean;
};

/**
 * Decides what a Supabase auth event means for the app. supabase-js re-emits
 * SIGNED_IN every time the tab regains focus and TOKEN_REFRESHED on every
 * refresh, both for the SAME user. Those must stay silent: only a different
 * user (or none) resets the cache.
 */
export function nextSessionState(
  event: string,
  previous: Session | null,
  next: Session | null,
  wasPasswordRecovery: boolean,
): SessionTransition {
  const previousId = previous?.user.id ?? null;
  const nextId = next?.user.id ?? null;
  const userChanged = previousId !== nextId;
  const clearCache = userChanged || event === 'SIGNED_OUT';

  // Sticky until the password is actually saved (USER_UPDATED) or the session
  // ends — a stray same-user SIGNED_IN/TOKEN_REFRESHED while the reset form is
  // still open must not un-flag it and let the gates bounce the user away.
  const isPasswordRecovery =
    event === 'PASSWORD_RECOVERY' ||
    (wasPasswordRecovery && event !== 'USER_UPDATED' && event !== 'SIGNED_OUT' && Boolean(next));

  // Same user and same token: nothing to tell React about.
  if (!userChanged && previous && next && previous.access_token === next.access_token) {
    return { session: previous, clearCache, isPasswordRecovery };
  }
  return { session: next, clearCache, isPasswordRecovery };
}
