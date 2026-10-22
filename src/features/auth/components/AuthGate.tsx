import { Redirect, useSegments } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Spinner, useToast } from '@/components/ui';
import { useClaimPendingMemberships } from '@/features/members/api/useClaimPendingMemberships';
import { useMyBusinesses } from '@/features/onboarding/api/useBusiness';
import { isSupabaseConfigured } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useAccessGuard } from '../api/useAccessGuard';
import {
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
 *
 * A verified user's pending "add by email" memberships are claimed here
 * (`useClaimPendingMemberships`). The gate waits for that FIRST claim before it
 * may send a business-less user to onboarding, so someone who was added never
 * sees onboarding (or starts a trial). A failed claim does not hold the gate: it
 * is reported once and retried on the next focus.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAuthenticated, isEmailVerified, isPasswordRecovery, loading, user } = useSession();
  const segments = useSegments();
  const claimEnabled =
    isSupabaseConfigured && isAuthenticated && isEmailVerified && !isPasswordRecovery;
  const claim = useClaimPendingMemberships({ userId: user?.id ?? null, enabled: claimEnabled });
  const joinedCount = claim.data?.length ?? 0;
  const claimFailed = claim.isError;
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
  );
  // Only the FIRST claim per user holds the gate (`isFetched` is per query key, which
  // includes the user id); later focus refetches run in the background.
  const waitForClaim = claimEnabled && !claim.isFetched;

  // Once per claim result (`dataUpdatedAt` changes only when a new result lands).
  const claimResultAt = claim.dataUpdatedAt;
  useEffect(() => {
    if (joinedCount > 0) {
      toast.show({ message: t('members.claim.joined', { count: joinedCount }), tone: 'success' });
    }
  }, [claimResultAt, joinedCount, toast, t]);

  useEffect(() => {
    if (claimFailed) toast.show({ message: t('members.claim.failed'), tone: 'error' });
  }, [claimFailed, toast, t]);

  const decision = authGateDecision({
    isSupabaseConfigured,
    loading,
    isAuthenticated,
    isEmailVerified,
    isPasswordRecovery,
    segments: path,
    hasBusiness,
    waitForBusinesses,
    waitForRejoin,
    waitForClaim,
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
