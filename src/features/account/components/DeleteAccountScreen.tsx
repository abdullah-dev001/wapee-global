import { TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { PageContainer, Screen } from '@/components/layout';
import {
  Button,
  Card,
  ErrorState,
  Input,
  Skeleton,
  Spinner,
  Text,
  useToast,
} from '@/components/ui';
import { useSession } from '@/features/auth';
import { getSupabase } from '@/lib/supabase';
import { theme, useBreakpoint } from '@/lib/theme';

import { accountErrorKey, emailsMatch } from '../accountLogic';
import { AccountError, useAccountMe, useDeleteAccount, useDeleteBlockers } from '../api/useAccount';

const MAX_WIDTH = 640;

/**
 * Settings > Account > Delete my account. Explains what goes and what stays, refuses a sole Owner (with the
 * business names), and otherwise asks for the password and the typed email. Nothing here can be undone, so Back is
 * swallowed while the request runs. The Edge Function re-checks everything.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const me = useAccountMe();
  const blockers = useDeleteBlockers();
  const remove = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const email = me.data?.email ?? user?.email ?? '';
  const ready = emailsMatch(typed, email) && password.length > 0;

  const running = remove.isPending;
  useEffect(() => {
    if (!running) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [running]);

  const errorCode = remove.error instanceof AccountError ? remove.error.code : null;
  const refusedBusinesses =
    remove.error instanceof AccountError && remove.error.code === 'sole_owner'
      ? remove.error.businesses
      : [];
  const soleOwned = blockers.data?.businesses.length ? blockers.data.businesses : refusedBusinesses;

  const submit = () =>
    remove.mutate(
      { password, confirmEmail: typed },
      {
        onSuccess: async () => {
          // The account is gone on the server; drop the local session (an error here is expected and harmless).
          await getSupabase()
            .auth.signOut({ scope: 'local' })
            .catch(() => undefined);
          queryClient.clear();
          toast.show({ message: t('account.delete.done'), tone: 'success' });
          router.replace('/login');
        },
      },
    );

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('account.delete.title')}
        subtitle={t('account.delete.subtitle')}
        maxWidth={isDesktop ? MAX_WIDTH : undefined}
      >
        {blockers.isPending ? (
          <Skeleton height={260} />
        ) : blockers.isError ? (
          <ErrorState
            title={t('account.loadFailed')}
            onRetry={() => void blockers.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : (
          <Card>
            <View style={styles.stack}>
              <View style={styles.warning}>
                <TriangleAlert
                  size={theme.iconSize.lg}
                  strokeWidth={theme.iconStroke}
                  color={theme.colors.errorText}
                />
                <Text variant="cardTitle" color="error">
                  {t('account.delete.warningTitle')}
                </Text>
              </View>
              <Text variant="paragraph" color="textSecondary">
                {t('account.delete.warningBody')}
              </Text>
              <Text variant="label">{t('account.delete.removedTitle')}</Text>
              <Text variant="helper" color="textSecondary">
                {t('account.delete.removedBody')}
              </Text>
              <Text variant="label">{t('account.delete.keptTitle')}</Text>
              <Text variant="helper" color="textSecondary">
                {t('account.delete.keptBody')}
              </Text>

              {blockers.data.superAdmin ? (
                <Text variant="paragraph" color="error" accessibilityRole="alert">
                  {t('account.errors.super_admin')}
                </Text>
              ) : soleOwned.length > 0 ? (
                <View style={styles.stack} accessibilityRole="alert">
                  <Text variant="label" color="error">
                    {t('account.delete.blockedTitle')}
                  </Text>
                  <Text variant="paragraph" color="textSecondary">
                    {t('account.delete.blockedBody')}
                  </Text>
                  {soleOwned.map((b) => (
                    <Text key={b.id} variant="cardTitle">
                      {b.name}
                    </Text>
                  ))}
                  <Button
                    variant="secondary"
                    onPress={() => router.push('/settings/delete-business')}
                  >
                    {t('account.delete.goDeleteBusiness')}
                  </Button>
                </View>
              ) : running ? (
                <View
                  style={styles.progress}
                  accessibilityRole="progressbar"
                  accessibilityLiveRegion="polite"
                >
                  <Spinner size={theme.iconSize.md} color="primary" />
                  <Text variant="helper" color="textSecondary">
                    {t('account.delete.progress')}
                  </Text>
                </View>
              ) : (
                <>
                  <Input
                    label={t('account.delete.password')}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                  />
                  <Input
                    label={t('account.delete.typeEmail', { email })}
                    value={typed}
                    onChangeText={setTyped}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    error={errorCode ? t(accountErrorKey(errorCode)) : undefined}
                  />
                  <Button variant="danger" disabled={!ready} onPress={submit}>
                    {t('account.delete.confirm')}
                  </Button>
                </>
              )}
            </View>
          </Card>
        )}
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  warning: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  progress: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
});
