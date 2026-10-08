import { ChevronRight, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PageContainer, Screen } from '@/components/layout';
import { Card, ErrorState, Skeleton, Text } from '@/components/ui';
import { theme, useBreakpoint } from '@/lib/theme';

import { useAccountMe } from '../api/useAccount';
import { ChangeEmailCard } from './ChangeEmailCard';
import { ChangePasswordCard } from './ChangePasswordCard';

const MAX_WIDTH = 640;

/** Settings > Account: sign-in email, password, and the way to delete the account. Open to every signed-in person. */
export function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useAccountMe();
  const { isDesktop } = useBreakpoint();

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('account.title')}
        subtitle={t('account.subtitle')}
        maxWidth={isDesktop ? MAX_WIDTH : undefined}
      >
        {me.isPending ? (
          <View style={styles.stack}>
            <Skeleton height={220} />
            <Skeleton height={300} />
          </View>
        ) : me.isError ? (
          <ErrorState
            title={t('account.loadFailed')}
            onRetry={() => void me.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : (
          <View style={styles.stack}>
            <ChangeEmailCard me={me.data} />
            <ChangePasswordCard email={me.data.email} />
            <Card onPress={() => router.push('/settings/delete-account')}>
              <View style={styles.row}>
                <Trash2
                  size={theme.iconSize.lg}
                  strokeWidth={theme.iconStroke}
                  color={theme.colors.errorText}
                />
                <View style={styles.rowText}>
                  <Text variant="cardTitle" color="error">
                    {t('account.delete.cardTitle')}
                  </Text>
                  <Text variant="helper" color="textSecondary">
                    {t('account.delete.cardSubtitle')}
                  </Text>
                </View>
                <ChevronRight
                  size={theme.iconSize.md}
                  strokeWidth={theme.iconStroke}
                  color={theme.colors.textMuted}
                />
              </View>
            </Card>
          </View>
        )}
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[16] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[14],
    minHeight: theme.layout.minTouchTarget,
  },
  rowText: { flex: 1, gap: theme.spacing[2] },
});
