import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Button, Text } from '@/components/ui';
import { launch } from '@/config/launch';
import { theme } from '@/lib/theme';

import { useGoogleSignIn } from '../api/useAuthMutations';
import { authErrorKey } from '../authErrorKey';
import { browserAvailabilityInput, isGoogleSignInAvailable } from '../oauth';

/**
 * Google's own "G" mark. Its four colours are part of Google's brand asset (their sign-in
 * branding rules require the unaltered mark), so they live in this SVG, not in the theme.
 */
const GOOGLE_G = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

/**
 * "Continue with Google" plus an "or" divider, for the login and signup screens. Renders nothing
 * where Google sign-in is not offered: switched off for this build (`launch.googleSignIn`, env
 * EXPO_PUBLIC_GOOGLE_SIGNIN), native apps, or an installed iOS PWA (see `oauth.ts`).
 * A failure to START the redirect is shown here; a failure coming BACK is shown by
 * `/auth/callback`.
 */
export function GoogleSignInButton() {
  const { t } = useTranslation();
  const google = useGoogleSignIn();
  const [error, setError] = useState<string | null>(null);
  const available = useMemo(
    () => launch.googleSignIn && isGoogleSignInAvailable(browserAvailabilityInput(Platform.OS)),
    [],
  );

  if (!available) return null;

  return (
    <View style={styles.block}>
      <Button
        fullWidth
        size="lg"
        variant="ghost"
        startElement={
          <SvgXml xml={GOOGLE_G} width={theme.iconSize.md} height={theme.iconSize.md} />
        }
        // Not kept "loading" after success: Back from Google can restore this page from the
        // browser's cache, and a stuck spinner would block a second try.
        loading={google.isPending}
        onPress={() => {
          setError(null);
          google.mutate(undefined, { onError: (e) => setError(t(authErrorKey(e))) });
        }}
      >
        {t('auth.google.continue')}
      </Button>
      {error ? (
        <Text variant="small" color="error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no">
        <View style={styles.rule} />
        <Text variant="small" color="textMuted">
          {t('auth.google.or')}
        </Text>
        <View style={styles.rule} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.spacing[16] },
  divider: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[12] },
  rule: {
    flex: 1,
    height: theme.borderWidth.hairline,
    backgroundColor: theme.colors.border,
  },
});
