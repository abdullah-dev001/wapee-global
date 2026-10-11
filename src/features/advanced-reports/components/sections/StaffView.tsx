import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, EmptyState, Text } from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';
import { theme } from '@/lib/theme';

import { type StaffData } from '../../reportTypes';
import { reportStyles } from '../ReportParts';

/** Appointments, revenue and commission per team member (money only where the role may see it). */
export function StaffView({ current, previous }: { current: StaffData; previous: StaffData }) {
  const { t, i18n } = useTranslation();
  if (current.staff.length === 0) {
    return <EmptyState compact title={t('advReports.staff.none')} />;
  }
  return (
    <View style={reportStyles.stack}>
      {current.staff.map((s) => {
        const prev = previous.staff.find((x) => x.staffId === s.staffId);
        return (
          <Card key={s.staffId}>
            <Text variant="cardTitle">{s.staffName}</Text>
            <Text variant="body">
              {t('advReports.staff.appointments')} {s.appointments.total}
              {prev ? ` (${prev.appointments.total})` : ''} · {s.appointments.completed}{' '}
              {t('advReports.staff.completed')} · {s.appointments.cancelled}{' '}
              {t('advReports.staff.cancelled')} · {s.appointments.noShow}{' '}
              {t('advReports.staff.noShow')}
            </Text>
            {s.money.length === 0 ? (
              <Text variant="helper" color="textMuted">
                {t('advReports.staff.noMoney')}
              </Text>
            ) : (
              s.money.map((m) => (
                <View key={m.currency} style={styles.money}>
                  <Text variant="helper" color="textSecondary">
                    {m.currency}
                  </Text>
                  {m.netRevenueMinor !== null ? (
                    <Text variant="body">
                      {t('advReports.staff.revenue')}{' '}
                      {formatMinor(m.netRevenueMinor, m.currency, i18n.language)}
                    </Text>
                  ) : null}
                  {m.commissionNetMinor !== null ? (
                    <Text variant="body">
                      {t('advReports.staff.commission')}{' '}
                      {formatMinor(m.commissionNetMinor, m.currency, i18n.language)}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  money: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[12],
    marginTop: theme.spacing[4],
  },
});
