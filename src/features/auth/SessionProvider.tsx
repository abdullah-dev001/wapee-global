import { type Session, type User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { nextSessionState } from './sessionState';

export type SessionState = {
  session: Session | null;
  user: User | null;
  /** True until the stored session has been read back on launch. */
  loading: boolean;
  /** Signed in. */
  isAuthenticated: boolean;
  /** Supabase only issues a session once the email is confirmed, but a project
   *  with confirmation disabled can produce an unverified one — check explicitly. */
  isEmailVerified: boolean;
  /**
   * True from the moment a password-recovery email link signs the user in
   * until the password is actually saved (or the session ends). The gates
   * (`AuthGate`, `AdminAccessGate`) read this to force `/reset-password`
   * instead of their ordinary redirect, including for a 2FA-enrolled admin.
   */
  isPasswordRecovery: boolean;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * Single source of auth state. Supabase persists the session itself
 * (SecureStore on native, localStorage on web); this exposes it to React and
 * clears the query cache on sign-out so no tenant data survives a user switch.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  // Whether Supabase is configured is known at import time, so start settled
  // when there is no client to wait for.
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // Latest session for the auth listener, which must not re-subscribe on change.
  const sessionRef = useRef<Session | null>(null);
  const isPasswordRecoveryRef = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;

    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      sessionRef.current = data.session;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((event, nextSession) => {
      // Same-user SIGNED_IN / TOKEN_REFRESHED (fired on every tab refocus) is silent.
      const transition = nextSessionState(
        event,
        sessionRef.current,
        nextSession,
        isPasswordRecoveryRef.current,
      );
      sessionRef.current = transition.session;
      isPasswordRecoveryRef.current = transition.isPasswordRecovery;
      setSession(transition.session);
      setIsPasswordRecovery(transition.isPasswordRecovery);
      setLoading(false);
      // A different user (or none) must never see the previous user's cache.
      if (transition.clearCache) queryClient.clear();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<SessionState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAuthenticated: Boolean(session),
      isEmailVerified: Boolean(session?.user.email_confirmed_at),
      isPasswordRecovery,
    }),
    [session, loading, isPasswordRecovery],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Auth state. Throws if the provider is missing. */
export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>.');
  return context;
}
