import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useResetPassword } from '@/features/auth/api/useAuthMutations';
import { authErrorKey } from '@/features/auth/authErrorKey';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { PasswordField } from '@/features/auth/components/PasswordField';
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from '@/features/auth/schemas/auth.schemas';
import { theme } from '@/lib/theme';

/**
 * Reached from the emailed recovery link, which has already signed the user
 * in, so `updateUser()` sets the new password directly. (Super admin TOTP was
 * removed in 20261026130000, so no account needs a code step-up here any more.)
 */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const reset = useResetPassword();
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    reset.mutate(values, { onError: (error) => setServerError(t(authErrorKey(error))) });
  });

  if (reset.isSuccess) {
    return (
      <AuthLayout title={t('auth.reset.done')} subtitle={t('auth.reset.doneBody')}>
        <Button fullWidth size="lg" onPress={() => router.replace('/')}>
          {t('nav.today')}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')}>
      <View style={styles.form}>
        {serverError ? (
          <View style={styles.alert}>
            <Text variant="small" color="error">
              {serverError}
            </Text>
          </View>
        ) : null}

        <PasswordField
          control={control}
          name="password"
          label={t('auth.fields.password')}
          placeholder={t('auth.placeholders.password')}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PasswordField
          control={control}
          name="confirmPassword"
          label={t('auth.fields.confirmPassword')}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <Button fullWidth size="lg" onPress={onSubmit} loading={reset.isPending}>
          {t('auth.reset.submit')}
        </Button>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
  alert: {
    padding: theme.spacing[12],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.errorLight,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.error,
  },
});
