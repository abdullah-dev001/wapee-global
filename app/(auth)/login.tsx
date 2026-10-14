import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { Button, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { isAccountDisabledError, useDisabledNotice } from '@/features/auth/accountDisabled';
import { useLogin } from '@/features/auth/api/useAuthMutations';
import { authErrorKey } from '@/features/auth/authErrorKey';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { loginSchema, type LoginValues } from '@/features/auth/schemas/auth.schemas';
import { theme } from '@/lib/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const disabledNotice = useDisabledNotice();

  const { control, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    disabledNotice.clear();
    login.mutate(values, {
      // The session listener redirects; replace() avoids a back-to-login entry.
      onSuccess: () => router.replace('/'),
      onError: (error) =>
        setServerError(
          isAccountDisabledError(error)
            ? t('auth.accountDisabled', { email: brand.supportEmail })
            : t(authErrorKey(error)),
        ),
    });
  });

  return (
    <AuthLayout
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle', { appName: brand.name })}
      footer={
        <>
          <Text variant="body" color="textSecondary">
            {t('auth.login.noAccount', { appName: brand.name })}
          </Text>
          <Link href="/signup" style={styles.link}>
            {t('auth.login.createAccount')}
          </Link>
        </>
      }
    >
      <View style={styles.form}>
        {disabledNotice.visible && !serverError ? (
          <View accessibilityRole="alert" style={styles.alert}>
            <Text variant="small" color="error">
              {t('auth.accountDisabled', { email: brand.supportEmail })}
            </Text>
          </View>
        ) : null}
        {serverError ? (
          <View style={styles.alert}>
            <Text variant="small" color="error">
              {serverError}
            </Text>
          </View>
        ) : null}

        <FormField
          control={control}
          name="email"
          label={t('auth.fields.email')}
          placeholder={t('auth.placeholders.email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <PasswordField
          control={control}
          name="password"
          label={t('auth.fields.password')}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <Link href="/forgot-password" style={[styles.link, styles.forgot]}>
          {t('auth.login.forgot')}
        </Link>

        <Button
          fullWidth
          size="lg"
          onPress={onSubmit}
          loading={formState.isSubmitting || login.isPending}
        >
          {t('auth.login.submit')}
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
  link: { ...theme.text.label, color: theme.colors.primary },
  forgot: { alignSelf: 'flex-end', marginTop: -theme.spacing[4] },
});
