import { Coins } from 'lucide-react-native';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { usePagePadding } from '@/components/layout/usePagePadding';
import { Button, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { formatDateTime, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useSmsBalance, useSmsLedger, type LedgerRow } from '../api/useSmsCredits';
import { formatCredits, formatCreditsSigned, ledgerKindKey } from '../messageLogic';

/**
 * SMS credits (permission sms.send): the balance and the ledger, newest first.
 * Adding credits is a super-admin job (Phase 8): this screen only points at it.
 */
export function SmsCreditsScreen() {
  const { t, i18n } = useTranslation();
  const { businessId, business, branchId } = useCurrentScope();
  const pagePadding = usePagePadding();
  const balance = useSmsBalance(businessId);
  const ledger = useSmsLedger(businessId);

  const zone = useMemo(
    () => business?.branches.find((b) => b.id === branchId)?.timezone ?? 'UTC',
    [business, branchId],
  );
  const items = useMemo(() => ledger.data?.pages.flatMap((p) => p.items) ?? [], [ledger.data]);

  const header = (
    <View style={styles.stack}>
      <Card>
        <View style={styles.stack}>
          <Text variant="label" color="textSecondary">
            {t('notifications.credits.balance')}
          </Text>
          {balance.isPending ? (
            <Skeleton height={36} width={140} />
          ) : balance.isError ? (
            <ErrorState
              compact
              title={t('notifications.credits.loadError')}
              onRetry={() => void balance.refetch()}
              retryLabel={t('actions.retry')}
            />
          ) : (
            <Text variant="statValue">
              {formatCredits(balance.data, i18n.language)}{' '}
              <Text variant="body" color="textSecondary">
                {t('notifications.credits.unit')}
              </Text>
            </Text>
          )}
          <Text variant="helper" color="textSecondary">
            {t('notifications.credits.rateHint')}
          </Text>
          {/* Seam for Phase 8: the super-admin "add credits" action lands here. */}
          <Text variant="helper" color="textSecondary">
            {t('notifications.credits.addHint')}
          </Text>
        </View>
      </Card>
      <Text variant="sectionTitle">{t('notifications.credits.history')}</Text>
    </View>
  );

  return (
    <Screen edges={['top']} scroll={false}>
      <PageContainer
        title={t('notifications.credits.title')}
        subtitle={t('notifications.credits.subtitle')}
      >
        {null}
      </PageContainer>
      <View style={[styles.body, { paddingHorizontal: pagePadding }]}>
        {ledger.isError ? (
          <ErrorState
            title={t('notifications.credits.loadError')}
            onRetry={() => void ledger.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(row) => String(row.id)}
            contentContainerStyle={styles.list}
            ListHeaderComponent={header}
            renderItem={({ item }) => <LedgerItem row={item} zone={zone} locale={i18n.language} />}
            ListEmptyComponent={
              ledger.isPending ? (
                <View style={styles.stack}>
                  {[0, 1, 2].map((n) => (
                    <Skeleton key={n} height={56} radius="lg" />
                  ))}
                </View>
              ) : (
                <EmptyState
                  compact
                  icon={Coins}
                  title={t('notifications.credits.empty')}
                  description={t('notifications.credits.emptyMessage')}
                />
              )
            }
            ListFooterComponent={
              ledger.hasNextPage ? (
                <View style={styles.more}>
                  <Button
                    variant="secondary"
                    loading={ledger.isFetchingNextPage}
                    onPress={() => void ledger.fetchNextPage()}
                  >
                    {t('notifications.credits.loadMore')}
                  </Button>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </Screen>
  );
}

function LedgerItem({ row, zone, locale }: { row: LedgerRow; zone: string; locale: string }) {
  const { t } = useTranslation();
  const positive = row.amount > 0;
  return (
    <Card>
      <View style={styles.rowTop}>
        <View style={styles.rowText}>
          <Text variant="bodyStrong">{t(ledgerKindKey(row.kind))}</Text>
          <Text variant="helper" color="textSecondary">
            {formatDateTime(row.createdAt as UtcIso, zone, locale, 'medium')}
            {row.segments
              ? ` · ${t('notifications.credits.segments', { count: row.segments })}`
              : ''}
          </Text>
          {row.note ? (
            <Text variant="helper" color="textSecondary">
              {row.note}
            </Text>
          ) : null}
        </View>
        <View style={styles.rowAmount}>
          <Text variant="bodyStrong" color={positive ? 'success' : 'textPrimary'}>
            {formatCreditsSigned(row.amount, locale)}
          </Text>
          <Text variant="helper" color="textSecondary">
            {t('notifications.credits.balanceAfter', {
              value: formatCredits(row.balanceAfter, locale),
            })}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  stack: { gap: theme.spacing[12] },
  list: { gap: theme.spacing[12], paddingBottom: theme.spacing[32] },
  more: { alignItems: 'center', paddingVertical: theme.spacing[16] },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing[12] },
  rowText: { flex: 1, gap: theme.spacing[2] },
  rowAmount: { alignItems: 'flex-end', gap: theme.spacing[2] },
});
