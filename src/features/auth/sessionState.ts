import { type Session } from '@supabase/supabase-js';

export type SessionTransition = {
  /** The session object to expose. The previous object is kept when nothing
   *  visible changed, so context consumers do not re-render for no reason. */
  session: Session | null;
  /** Drop the whole query cache: the signed-in user changed, or signed out. */
  clearCache: boolean;
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
): SessionTransition {
  const previousId = previous?.user.id ?? null;
  const nextId = next?.user.id ?? null;
  const userChanged = previousId !== nextId;
  const clearCache = userChanged || event === 'SIGNED_OUT';

  // Same user and same token: nothing to tell React about.
  if (!userChanged && previous && next && previous.access_token === next.access_token) {
    return { session: previous, clearCache };
  }
  return { session: next, clearCache };
}
