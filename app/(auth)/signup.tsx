import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { LegalLinks } from '@/components/shared/LegalLinks';
import { Button, Text } from '@/components/ui';
import { useSignup } from '@/features/auth/api/useAuthMutations';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { signupSchema, type SignupValues } from '@/features/auth/schemas/auth.schemas';
import { theme } from '@/lib/theme';

export default function SignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const signup = useSignup();
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit, getValues } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    signup.mutate(values, {
      // Email confirmation is on, so there is no session yet: wait on /verify.
      onSuccess: () =>
        router.replace({ pathname: '/verify', params: { email: getValues('email') } }),
      onError: (error) => setServerError(error.message),
    });
  });

  return (
    <AuthLayout
      title={t('auth.signup.title')}
      subtitle={t('auth.signup.subtitle')}
      footer={
        <>
          <Text variant="body" color="textSecondary">
            {t('auth.signup.haveAccount')}
          </Text>
          <Link href="/login" style={styles.link}>
            {t('auth.signup.signIn')}
          </Link>
        </>
      }
    >
      <View style={styles.form}>
        {serverError ? (
          <View style={styles.alert}>
            <Text variant="small" color="error">
              {serverError}
            </Text>
          </View>
        ) : null}

        <FormField
          control={control}
          name="fullName"
          label={t('auth.fields.fullName')}
          placeholder={t('auth.placeholders.fullName')}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
        />

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
          placeholder={t('auth.placeholders.password')}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <Button fullWidth size="lg" onPress={onSubmit} loading={signup.isPending}>
          {t('auth.signup.submit')}
        </Button>
        <LegalLinks lead={t('legal.signupNotice')} />
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
});
