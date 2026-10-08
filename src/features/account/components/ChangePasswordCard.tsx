import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text, useToast } from '@/components/ui';
import { PasswordField } from '@/features/auth';
import { theme } from '@/lib/theme';

import { accountErrorKey } from '../accountLogic';
import { AccountError, useChangePassword } from '../api/useAccount';
import { changePasswordSchema, type ChangePasswordValues } from '../schemas/account.schemas';

const EMPTY: ChangePasswordValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

/** Settings > Account > Password. Current password, then the new one (8-72, like sign-up). */
export function ChangePasswordCard({ email }: { email: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const change = useChangePassword();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, reset } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    change.mutate(
      { email, values },
      {
        onSuccess: () => {
          reset(EMPTY);
          toast.show({ message: t('account.password.changed'), tone: 'success' });
        },
        onError: (error) =>
          setServerError(t(accountErrorKey(error instanceof AccountError ? error.code : null))),
      },
    );
  });

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="cardTitle">{t('account.password.title')}</Text>
        <Text variant="helper" color="textSecondary">
          {t('account.password.help')}
        </Text>
        {serverError ? (
          <Text variant="helper" color="error" accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}
        <PasswordField
          control={control}
          name="currentPassword"
          label={t('account.password.current')}
          autoComplete="current-password"
          textContentType="password"
        />
        <PasswordField
          control={control}
          name="newPassword"
          label={t('account.password.new')}
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
        <Button onPress={onSubmit} loading={change.isPending}>
          {t('account.password.submit')}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
});
