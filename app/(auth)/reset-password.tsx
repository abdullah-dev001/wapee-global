import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Input, Text } from '@/components/ui';
import { isTotpCodeComplete, normaliseTotpCode } from '@/features/admin/adminLogic';
import { useTotpFactors, useVerifyTotp } from '@/features/admin/api/useTwoFactor';
import { useResetPassword } from '@/features/auth/api/useAuthMutations';
import { authErrorKey, isInsufficientAalError } from '@/features/auth/authErrorKey';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { PasswordField } from '@/features/auth/components/PasswordField';
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from '@/features/auth/schemas/auth.schemas';
import { theme } from '@/lib/theme';

/**
 * Reached from the emailed recovery link, which has already signed the user
 * in at aal1, so `updateUser()` can usually set the new password directly.
 *
 * An account with a verified TOTP factor (super admin 2FA) is the exception:
 * Supabase refuses a password change at aal1 for those (`insufficient_aal`).
 * This screen asks for the 6-digit code right here — reusing the same
 * enrol/verify API the admin 2FA screen uses — then retries the save, instead
 * of bouncing the user through a separate admin-only flow that has no way
 * back to actually resetting the password (the production bug this fixes).
 */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const reset = useResetPassword();
  const factors = useTotpFactors();
  const verifyTotp = useVerifyTotp();
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [code, setCode] = useState('');
  const [wrongCode, setWrongCode] = useState(false);

  const { control, handleSubmit, getValues } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    reset.mutate(values, {
      onError: (error) => {
        if (isInsufficientAalError(error)) {
          setNeedsTotp(true);
          return;
        }
        setServerError(t(authErrorKey(error)));
      },
    });
  });

  const verifiedFactor = factors.data?.find((f) => f.verified) ?? null;

  const submitTotp = () => {
    if (!verifiedFactor || !isTotpCodeComplete(code)) return;
    setWrongCode(false);
    verifyTotp.mutate(
      { factorId: verifiedFactor.id, code },
      {
        // Verifying the TOTP factor upgrades the session to aal2; retry the
        // same password the user already typed.
        onSuccess: () => {
          setCode('');
          reset.mutate(getValues(), {
            onError: (error) => setServerError(t(authErrorKey(error))),
          });
        },
        onError: () => {
          setWrongCode(true);
          setCode('');
        },
      },
    );
  };

  if (reset.isSuccess) {
    return (
      <AuthLayout title={t('auth.reset.done')} subtitle={t('auth.reset.doneBody')}>
        <Button fullWidth size="lg" onPress={() => router.replace('/')}>
          {t('nav.today')}
        </Button>
      </AuthLayout>
    );
  }

  if (needsTotp) {
    return (
      <AuthLayout title={t('auth.reset.twoFactorTitle')} subtitle={t('auth.reset.twoFactorIntro')}>
        <View style={styles.form}>
          {serverError ? (
            <View style={styles.alert}>
              <Text variant="small" color="error">
                {serverError}
              </Text>
            </View>
          ) : null}
          <Input
            label={t('admin.twoFactor.codeLabel')}
            value={code}
            onChangeText={(text) => setCode(normaliseTotpCode(text))}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={7}
            placeholder="123456"
            error={wrongCode ? t('admin.twoFactor.wrongCode') : undefined}
            returnKeyType="done"
            onSubmitEditing={submitTotp}
          />
          <Button
            fullWidth
            size="lg"
            onPress={submitTotp}
            loading={verifyTotp.isPending || reset.isPending || factors.isPending}
            disabled={!isTotpCodeComplete(code) || !verifiedFactor}
          >
            {t('admin.twoFactor.verify')}
          </Button>
        </View>
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
