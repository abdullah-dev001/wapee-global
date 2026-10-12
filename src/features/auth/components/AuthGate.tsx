import { Redirect, useSegments } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spinner } from '@/components/ui';
import { useMyBusinesses } from '@/features/onboarding/api/useBusiness';
import { isSupabaseConfigured } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useAccessGuard } from '../api/useAccessGuard';
import {
  ACCEPT_INVITE_ROUTE,
  authGateDecision,
  ONBOARDING_ROUTE,
  shouldWaitForRejoin,
  useGateSpinner,
} from '../gateSettled';
import { useSession } from '../SessionProvider';

/**
 * Decides where a user belongs (CLAUDE.md §4, §7) — the actual decision is
 * `authGateDecision()` (pure, unit-tested); this component only wires in
 * session/router/query state.
 *
 * **The route tree (`children`, i.e. the `Stack`) is ALWAYS rendered**, even
 * while a decision is still pending — a loading state overlays it instead of
 * replacing it. Swapping the whole tree for a bare spinner unmounts React
 * Navigation's screens; React Navigation then loses its own navigation state,
 * and on recovery falls back to the default route, permanently overwriting
 * the real URL (including query/hash — a `?token=…` on `/accept-invite`, for
 * one) via its own `history.replace` before the real screen ever gets to read
 * it. Confirmed with a live browser trace (2026-10-12): the unmount-based
 * spinner silently turned `/accept-invite?token=…#access_token=…` into `/`
 * mid-flight, well before any redirect decision below ever ran.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isEmailVerified, loading, user } = useSession();
  const segments = useSegments();
  // Only runs once signed in (the hook is disabled otherwise).
  const businesses = useMyBusinesses();
  // Ends the session when every business of this account is suspended (checked on focus / reconnect).
  useAccessGuard();
  const waitForBusinesses = useGateSpinner(businesses.isPending, user?.id ?? null);
  const hasBusiness = (businesses.data?.length ?? 0) > 0;
  const path = segments as readonly string[];
  const waitForRejoin = shouldWaitForRejoin(
    hasBusiness,
    businesses.isFetching,
    path.includes(ONBOARDING_ROUTE),
    path.includes(ACCEPT_INVITE_ROUTE),
  );

  const decision = authGateDecision({
    isSupabaseConfigured,
    loading,
    isAuthenticated,
    isEmailVerified,
    segments: path,
    hasBusiness,
    waitForBusinesses,
    waitForRejoin,
  });

  return (
    <>
      {children}
      {decision.kind === 'redirect' ? <Redirect href={decision.href} /> : null}
      {decision.kind === 'wait' ? (
        <View style={styles.overlay}>
          <Spinner size={24} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
