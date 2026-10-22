import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, Spinner, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { AuthLayout, useSession } from '@/features/auth';
import {
  oauthErrorKey,
  readOAuthCallbackError,
  type OAuthCallbackError,
} from '@/features/auth/oauth';
import { theme } from '@/lib/theme';

/** How long to wait for a session before saying sign-in did not complete. */
const NO_SESSION_TIMEOUT_MS = 15_000;

/**
 * Where Google (via Supabase) sends the browser back (`/auth/callback`). Web / PWA only.
 *
 * On success there is nothing to do here: supabase-js reads the session from the fragment while
 * the client starts, and `AuthGate` moves the user on (claiming any pending "add by email" first)
 * like from any other (auth) screen. This page only covers the two other outcomes: an error on the
 * URL (cancelled at Google, account disabled by our hook, anything else as one generic message),
 * and no session arriving at all.
 */
export default function OAuthCallbackScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, loading } = useSession();
  // Read once, on first render. The error parameters are left in the address: they are not secret,
  // and Expo Router writes its saved URL back over a raw history.replaceState, while replacing to
  // the same route remounts this screen and would lose the error.
  const [callbackError] = useState<OAuthCallbackError | null>(() =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? readOAuthCallbackError(window.location.href)
      : null,
  );
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (callbackError || isAuthenticated) return;
    const timer = setTimeout(() => setTimedOut(true), NO_SESSION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [callbackError, isAuthenticated]);

  const message = callbackError
    ? t(oauthErrorKey(callbackError), { email: brand.supportEmail })
    : timedOut && !loading && !isAuthenticated
      ? t('auth.google.incomplete')
      : null;

  return (
    <AuthLayout title={t('auth.google.callbackTitle')}>
      {message ? (
        <View style={styles.block}>
          <View accessibilityRole="alert" style={styles.alert}>
            <Text variant="small" color="error">
              {message}
            </Text>
          </View>
          <Button fullWidth onPress={() => router.replace('/login')}>
            {t('auth.google.backToSignIn')}
          </Button>
        </View>
      ) : (
        <View style={styles.centre}>
          <Spinner size={24} />
          <Text variant="body" color="textSecondary">
            {t('auth.google.signingIn')}
          </Text>
        </View>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.spacing[16] },
  centre: { alignItems: 'center', gap: theme.spacing[12], paddingVertical: theme.spacing[24] },
  alert: {
    padding: theme.spacing[12],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.errorLight,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.error,
  },
});
