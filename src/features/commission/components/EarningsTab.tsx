import { Coins } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MonthStepper } from '@/components/shared';
import { Button, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { monthBounds, shiftMonth } from '@/features/advanced-reports/periodLogic';
import { formatMinor } from '@/features/invoices/format';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { formatDate, todayInZone, type UtcIso } from '@/lib/time';

import { useCommissionEntries, useCommissionReport, useMyStaffId } from '../api/useCommission';
import { commissionErrorKey, entryReasonKey } from '../commissionLogic';
import { CurrencyBlock } from './PeriodTotals';

/** The signed-in person's OWN commission: a month of totals and the latest ledger lines. */
export function EarningsTab() {
  const { t, i18n } = useTranslation();
  const { businessId, business } = useCurrentScope();
  const zone = business?.branches.find((b) => b.is_primary)?.timezone ?? 'UTC';
  const [anchor, setAnchor] = useState(() => todayInZone(zone));
  const [limit, setLimit] = useState(20);
  const { from, to } = monthBounds(anchor);

  const mine = useMyStaffId(businessId);
  const report = useCommissionReport(
    businessId,
    null,
    from,
    to,
    mine.data ?? null,
    Boolean(mine.data),
  );
  const entries = useCommissionEntries(businessId, mine.data ?? null, limit);

  if (mine.isPending) return <Skeleton height={120} radius="lg" />;
  if (!mine.data) {
    return (
      <EmptyState
        icon={Coins}
        title={t('commission.noStaff.title')}
        description={t('commission.noStaff.description')}
      />
    );
  }

  return (
    <View style={styles.stack}>
      <MonthStepper
        anchor={anchor}
        onPrevious={() => setAnchor(shiftMonth(anchor, -1))}
        onNext={() => setAnchor(shiftMonth(anchor, 1))}
        previousLabel={t('commission.month.previous')}
        nextLabel={t('commission.month.next')}
      />
      {report.isError ? (
        <ErrorState
          title={t('commission.error.title')}
          description={t(commissionErrorKey(rpcCode(report.error)))}
          onRetry={() => void report.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : report.isPending ? (
        <Skeleton height={110} radius="lg" />
      ) : report.data.rows.length === 0 ? (
        <EmptyState
          compact
          icon={Coins}
          title={t('commission.empty.title')}
          description={t('commission.empty.description')}
        />
      ) : (
        report.data.rows.map((row) => <CurrencyBlock key={row.currency} row={row} />)
      )}

      <Text variant="sectionTitle">{t('commission.ledger')}</Text>
      {entries.isPending ? (
        <Skeleton height={64} radius="lg" />
      ) : (entries.data ?? []).length === 0 ? (
        <Text variant="helper" color="textMuted">
          {t('commission.ledgerEmpty')}
        </Text>
      ) : (
        <Card noPadding>
          {(entries.data ?? []).map((entry, index, list) => (
            <View
              key={entry.id}
              style={[styles.entry, index < list.length - 1 ? styles.divider : null]}
            >
              <View style={styles.entryText}>
                <Text variant="body">{t(entryReasonKey(entry.reason))}</Text>
                <Text variant="helper" color="textMuted">
                  {formatDate(entry.createdAt as UtcIso, zone, i18n.language, 'medium')}
                </Text>
              </View>
              <Text variant="bodyStrong" color={entry.kind === 'earn' ? 'success' : 'error'}>
                {entry.kind === 'earn' ? '+' : '-'}
                {formatMinor(entry.amountMinor, entry.currency, i18n.language)}
              </Text>
            </View>
          ))}
        </Card>
      )}
      {(entries.data ?? []).length >= limit ? (
        <Button
          variant="secondary"
          onPress={() => setLimit(limit + 20)}
          loading={entries.isFetching}
        >
          {t('commission.loadMore')}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    padding: theme.spacing[16],
  },
  divider: {
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  entryText: { flex: 1, gap: theme.spacing[2] },
});
