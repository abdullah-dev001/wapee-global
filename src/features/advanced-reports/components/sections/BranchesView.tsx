import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';

import { formatBp } from '../../reportLogic';
import { type BranchesData } from '../../reportTypes';
import { BarRow, reportStyles } from '../ReportParts';

/** Locations side by side. Bars compare only locations in the SAME currency. */
export function BranchesView({
  current,
  previous,
}: {
  current: BranchesData;
  previous: BranchesData;
}) {
  const { t, i18n } = useTranslation();
  return (
    <View style={reportStyles.stack}>
      {current.branches.map((b) => {
        const prev = previous.branches.find((x) => x.branchId === b.branchId);
        const max = Math.max(
          0,
          ...current.branches
            .filter((x) => x.currency === b.currency)
            .map((x) => x.netRevenueMinor ?? 0),
        );
        return (
          <Card key={b.branchId}>
            <Text variant="cardTitle">
              {b.name}
              {b.archived ? ` (${t('advReports.branches.archived')})` : ''} · {b.currency}
            </Text>
            {b.netRevenueMinor !== null ? (
              <BarRow
                label={t('advReports.branches.net')}
                valueText={formatMinor(b.netRevenueMinor, b.currency, i18n.language)}
                value={b.netRevenueMinor}
                max={max}
              />
            ) : null}
            {prev?.netRevenueMinor !== null && prev?.netRevenueMinor !== undefined ? (
              <Text variant="helper" color="textSecondary">
                {t('advReports.branches.previousNet')}{' '}
                {formatMinor(prev.netRevenueMinor, b.currency, i18n.language)}
              </Text>
            ) : null}
            {b.appointments ? (
              <Text variant="helper" color="textSecondary">
                {t('advReports.branches.appointments')} {b.appointments.total} ·{' '}
                {formatBp(b.appointments.completedBp)} · {formatBp(b.appointments.cancelledBp)} ·{' '}
                {formatBp(b.appointments.noShowBp)}
              </Text>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
