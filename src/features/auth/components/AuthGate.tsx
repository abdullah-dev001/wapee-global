import { Redirect, useSegments } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spinner } from '@/components/ui';
import { useMyBusinesses } from '@/features/onboarding/api/useBusiness';
import { isSupabaseConfigured } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useAccessGuard } from '../api/useAccessGuard';
import { shouldWaitForRejoin, useGateSpinner } from '../gateSettled';
import { useSession } from '../SessionProvider';

/** Route groups that an unauthenticated visitor may open. */
const PUBLIC_GROUPS = new Set(['(auth)', '(public)']);
/** Screens inside (auth) that a signed-in but unverified user still needs. */
const VERIFY_ROUTE = 'verify';
/** Where a verified user with no business goes. */
const ONBOARDING_ROUTE = 'onboarding';
/**
 * The invite screen. An invited person arrives here with no account and no
 * business, so it must be reachable while signed out AND must not be redirected
 * to onboarding — accepting the invite is what gives them a business.
 */
const ACCEPT_INVITE_ROUTE = 'accept-invite';

/**
 * Decides where a user belongs (CLAUDE.md §4, §7):
 * - signed out, private route    -> /login
 * - signed in, unverified        -> /verify
 * - verified, but has no business -> /onboarding
 * - fully set up, on an auth page -> /
 *
 * The inactive-business lock screen is added in the trial step.
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

  const group = segments[0];
  const isPublicGroup = typeof group === 'string' && PUBLIC_GROUPS.has(group);
  const isAuthGroup = group === '(auth)';
  const path = segments as readonly string[];
  const onVerifyScreen = path.includes(VERIFY_ROUTE);
  const onOnboardingScreen = path.includes(ONBOARDING_ROUTE);
  const onAcceptInviteScreen = path.includes(ACCEPT_INVITE_ROUTE);
  // The super admin area has its own guard; an admin may own no business at all.
  const onAdminRoute = group === '(admin)';
  const waitForRejoin = shouldWaitForRejoin(
    hasBusiness,
    businesses.isFetching,
    onOnboardingScreen,
    onAcceptInviteScreen,
  );

  // Without Supabase keys there is no auth at all; let the app render so the
  // dev warning and the gallery stay reachable.
  if (!isSupabaseConfigured) return <>{children}</>;

  if (loading) {
    return (
      <View style={styles.loading}>
        <Spinner size={24} />
      </View>
    );
  }

  if (!isAuthenticated && !isPublicGroup) return <Redirect href="/login" />;

  if (isAuthenticated && !isEmailVerified && !onVerifyScreen) return <Redirect href="/verify" />;

  if (isAuthenticated && isEmailVerified) {
    // Wait for the membership list before deciding; redirecting early would
    // bounce an existing owner through onboarding on every cold start, or
    // someone who just joined through a refetch still catching up.
    if (waitForBusinesses || waitForRejoin) {
      return (
        <View style={styles.loading}>
          <Spinner size={24} />
        </View>
      );
    }

    // Accepting an invite is how an invited person gets their first business, so
    // that screen is never redirected to onboarding or away from (auth).
    if (!hasBusiness && !onOnboardingScreen && !onAcceptInviteScreen && !onAdminRoute) {
      return <Redirect href="/onboarding" />;
    }
    if (hasBusiness && isAuthGroup && !onAcceptInviteScreen) return <Redirect href="/" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
