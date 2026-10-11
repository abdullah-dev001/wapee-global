import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { Badge, Button, Card, Text, useToast } from '@/components/ui';
import { PasswordField } from '@/features/auth';
import { theme } from '@/lib/theme';

import { accountErrorKey } from '../accountLogic';
import {
  AccountError,
  useChangeEmail,
  useResendEmailChange,
  type AccountMe,
} from '../api/useAccount';
import { changeEmailSchema, type ChangeEmailValues } from '../schemas/account.schemas';

/** Settings > Account > Email. Shows the sign-in address, the pending change if there is one, and the change form. */
export function ChangeEmailCard({ me }: { me: AccountMe }) {
  const { t } = useTranslation();
  const toast = useToast();
  const change = useChangeEmail();
  const resend = useResendEmailChange();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, reset } = useForm<ChangeEmailValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '', currentPassword: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    change.mutate(
      { email: me.email, values },
      {
        onSuccess: () => {
          reset({ newEmail: '', currentPassword: '' });
          toast.show({ message: t('account.email.requested'), tone: 'success' });
        },
        onError: (error) =>
          setServerError(t(accountErrorKey(error instanceof AccountError ? error.code : null))),
      },
    );
  });

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="cardTitle">{t('account.email.title')}</Text>
        <Text variant="paragraph" color="textSecondary">
          {t('account.email.current', { email: me.email })}
        </Text>
        {me.pendingEmail ? (
          <View style={styles.pending} accessibilityRole="alert">
            <Badge tone="warning">{t('account.email.pendingBadge')}</Badge>
            <Text variant="helper" color="textSecondary">
              {t('account.email.pendingBody', { email: me.pendingEmail, current: me.email })}
            </Text>
            <Button
              variant="secondary"
              size="sm"
              loading={resend.isPending}
              onPress={() =>
                resend.mutate(
                  { pendingEmail: me.pendingEmail ?? '' },
                  {
                    onSuccess: () =>
                      toast.show({ message: t('account.email.resent'), tone: 'success' }),
                    onError: (error) =>
                      toast.show({
                        message: t(accountErrorKey(error.code)),
                        tone: 'error',
                      }),
                  },
                )
              }
            >
              {t('account.email.resend')}
            </Button>
          </View>
        ) : null}
        {serverError ? (
          <Text variant="helper" color="error" accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}
        <FormField
          control={control}
          name="newEmail"
          label={t('account.email.new')}
          placeholder={t('auth.placeholders.email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
        />
        <PasswordField
          control={control}
          name="currentPassword"
          label={t('account.password.current')}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
        <Button onPress={onSubmit} loading={change.isPending}>
          {t('account.email.submit')}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  pending: { gap: theme.spacing[8], alignItems: 'flex-start' },
});
