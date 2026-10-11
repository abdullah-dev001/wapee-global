import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Text, useToast } from '@/components/ui';
import { useResendVerification, useSignOut } from '@/features/auth/api/useAuthMutations';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { useSession } from '@/features/auth/SessionProvider';
import { theme } from '@/lib/theme';

/**
 * Shown after signup while the user confirms their email. Supabase handles the
 * link itself: opening it signs the user in, the session listener fires, and
 * the effect below moves them on.
 */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const { user, isAuthenticated, isEmailVerified } = useSession();
  const resend = useResendVerification();
  const signOut = useSignOut();

  const email = user?.email ?? emailParam ?? '';

  useEffect(() => {
    if (isAuthenticated && isEmailVerified) router.replace('/');
  }, [isAuthenticated, isEmailVerified, router]);

  return (
    <AuthLayout title={t('auth.verify.title')} subtitle={t('auth.verify.subtitle', { email })}>
      <View style={styles.form}>
        <Button
          fullWidth
          variant="ghost"
          loading={resend.isPending}
          onPress={() =>
            resend.mutate(
              { email },
              {
                onSuccess: () => toast.show({ message: t('auth.verify.resent'), tone: 'success' }),
                onError: (error) => toast.show({ message: error.message, tone: 'error' }),
              },
            )
          }
        >
          {t('auth.verify.resend')}
        </Button>

        <Text
          variant="helper"
          color="textMuted"
          align="center"
          onPress={() => signOut.mutate(undefined, { onSuccess: () => router.replace('/login') })}
        >
          {t('auth.verify.wrongEmail')}
        </Text>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
});
