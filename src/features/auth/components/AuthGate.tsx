import { Redirect, useSegments } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spinner } from '@/components/ui';
import { useMyBusinesses } from '@/features/onboarding/api/useBusiness';
import { isSupabaseConfigured } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useSession } from '../SessionProvider';

/** Route groups that an unauthenticated visitor may open. */
const PUBLIC_GROUPS = new Set(['(auth)', '(public)']);
/** Screens inside (auth) that a signed-in but unverified user still needs. */
const VERIFY_ROUTE = 'verify';
/** Where a verified user with no business goes. */
const ONBOARDING_ROUTE = 'onboarding';

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
  const { isAuthenticated, isEmailVerified, loading } = useSession();
  const segments = useSegments();
  // Only runs once signed in (the hook is disabled otherwise).
  const businesses = useMyBusinesses();

  const group = segments[0];
  const isPublicGroup = typeof group === 'string' && PUBLIC_GROUPS.has(group);
  const isAuthGroup = group === '(auth)';
  const path = segments as readonly string[];
  const onVerifyScreen = path.includes(VERIFY_ROUTE);
  const onOnboardingScreen = path.includes(ONBOARDING_ROUTE);

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
    // bounce an existing owner through onboarding on every cold start.
    if (businesses.isPending) {
      return (
        <View style={styles.loading}>
          <Spinner size={24} />
        </View>
      );
    }

    const hasBusiness = (businesses.data?.length ?? 0) > 0;
    if (!hasBusiness && !onOnboardingScreen) return <Redirect href="/onboarding" />;
    if (hasBusiness && isAuthGroup) return <Redirect href="/" />;
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
