import { Redirect, useSegments } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spinner } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useSession } from '../SessionProvider';

/** Route groups that an unauthenticated visitor may open. */
const PUBLIC_GROUPS = new Set(['(auth)', '(public)']);
/** Screens inside (auth) that a signed-in but unverified user still needs. */
const VERIFY_ROUTE = 'verify';

/**
 * Decides where a user belongs (CLAUDE.md §4, §7):
 * - signed out, private route  -> /login
 * - signed in, unverified      -> /verify
 * - signed in, on an auth page -> /
 *
 * The business checks (no business -> onboarding, inactive -> lock screen)
 * are added in the onboarding and trial steps.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isEmailVerified, loading } = useSession();
  const segments = useSegments();

  const group = segments[0];
  const isPublicGroup = typeof group === 'string' && PUBLIC_GROUPS.has(group);
  const isAuthGroup = group === '(auth)';
  const onVerifyScreen = (segments as readonly string[]).includes(VERIFY_ROUTE);

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

  if (isAuthenticated && isEmailVerified && isAuthGroup) return <Redirect href="/" />;

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
