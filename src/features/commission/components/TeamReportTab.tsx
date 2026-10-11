import { Users } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MonthStepper } from '@/components/shared';
import { Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { monthBounds, shiftMonth } from '@/features/advanced-reports/periodLogic';
import { formatMinor } from '@/features/invoices/format';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { todayInZone } from '@/lib/time';

import { useCommissionReport } from '../api/useCommission';
import { commissionErrorKey, groupByStaff } from '../commissionLogic';
import { CurrencyBlock } from './PeriodTotals';

/** Everyone's commission for a month, per staff member and currency (never added across currencies). */
export function TeamReportTab() {
  const { t, i18n } = useTranslation();
  const { businessId, branchId, business } = useCurrentScope();
  const zone = business?.branches.find((b) => b.is_primary)?.timezone ?? 'UTC';
  const [anchor, setAnchor] = useState(() => todayInZone(zone));
  const { from, to } = monthBounds(anchor);
  // The current location when one is selected: a Branch-scope manager sees only their own anyway.
  const report = useCommissionReport(businessId, branchId, from, to);

  return (
    <View style={styles.stack}>
      <MonthStepper
        anchor={anchor}
        onPrevious={() => setAnchor(shiftMonth(anchor, -1))}
        onNext={() => setAnchor(shiftMonth(anchor, 1))}
        previousLabel={t('commission.month.previous')}
        nextLabel={t('commission.month.next')}
      />
      <Text variant="helper" color="textSecondary">
        {t('commission.teamNote')}
      </Text>
      {report.isError ? (
        <ErrorState
          title={t('commission.error.title')}
          description={t(commissionErrorKey(rpcCode(report.error)))}
          onRetry={() => void report.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : report.isPending ? (
        [0, 1].map((i) => <Skeleton key={i} height={96} radius="lg" />)
      ) : report.data.rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('commission.empty.title')}
          description={t('commission.empty.description')}
        />
      ) : (
        <>
          <Text variant="sectionTitle">{t('commission.teamTotals')}</Text>
          {report.data.totals.map((total) => (
            <CurrencyBlock key={total.currency} row={total} />
          ))}
          {groupByStaff(report.data.rows).map((staff) => (
            <Card key={staff.staffId}>
              <Text variant="cardTitle">{staff.staffName}</Text>
              {staff.rows.map((row) => (
                <View key={row.currency} style={styles.line}>
                  <Text variant="body" style={styles.lineLabel}>
                    {row.currency} · {t('commission.invoices', { count: row.invoiceCount })}
                  </Text>
                  <Text variant="bodyStrong">
                    {formatMinor(row.netMinor, row.currency, i18n.language)}
                  </Text>
                </View>
              ))}
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginTop: theme.spacing[8],
  },
  lineLabel: { flex: 1 },
});
