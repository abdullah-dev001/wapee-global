import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { Button, Text } from '@/components/ui';
import { useForgotPassword } from '@/features/auth/api/useAuthMutations';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '@/features/auth/schemas/auth.schemas';
import { theme } from '@/lib/theme';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const forgot = useForgotPassword();

  const { control, handleSubmit, getValues } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit((values) => forgot.mutate(values));

  // Always claim success: never reveal whether an account exists.
  if (forgot.isSuccess) {
    return (
      <AuthLayout title={t('auth.forgot.sent')}>
        <View style={styles.form}>
          <Text variant="body" color="textSecondary">
            {t('auth.forgot.sentBody', { email: getValues('email') })}
          </Text>
          <Link href="/login" style={styles.link}>
            {t('auth.forgot.backToLogin')}
          </Link>
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.forgot.title')}
      subtitle={t('auth.forgot.subtitle')}
      footer={
        <Link href="/login" style={styles.link}>
          {t('auth.forgot.backToLogin')}
        </Link>
      }
    >
      <View style={styles.form}>
        <FormField
          control={control}
          name="email"
          label={t('auth.fields.email')}
          placeholder={t('auth.placeholders.email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
        <Button fullWidth size="lg" onPress={onSubmit} loading={forgot.isPending}>
          {t('auth.forgot.submit')}
        </Button>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
  link: { ...theme.text.label, color: theme.colors.primary },
});
