import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { AuthLayout } from '@/features/auth';
import { theme } from '@/lib/theme';

/**
 * RETIRED invite link (`/accept-invite?token=…`, migration 20261026110000).
 *
 * People are now added by email: they join automatically when they sign in with that email once
 * it is verified. Old links therefore do nothing on their own; this page explains that and points
 * to sign in / create account. The token is removed from the address bar straight away so it does
 * not linger in history. A signed-in visitor never needs this page: `AuthGate` claims any pending
 * add and moves them on like any other (auth) screen.
 */
export default function AcceptInviteRetiredScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const hasToken = typeof params.token === 'string' && params.token.length > 0;

  useEffect(() => {
    if (hasToken) router.replace('/accept-invite');
  }, [hasToken, router]);

  return (
    <AuthLayout title={t('members.accept.title')}>
      <View style={styles.block}>
        <Text variant="paragraph" color="textSecondary">
          {t('members.accept.retired')}
        </Text>
        <Button fullWidth onPress={() => router.replace('/login')}>
          {t('members.accept.signIn')}
        </Button>
        <Button variant="ghost" fullWidth onPress={() => router.replace('/signup')}>
          {t('members.accept.createAccount')}
        </Button>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: theme.spacing[16],
  },
});
