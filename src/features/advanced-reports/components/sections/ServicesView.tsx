import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, EmptyState, Text } from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';

import { type ServicesData } from '../../reportTypes';
import { BarRow, reportStyles } from '../ReportParts';

/** Most booked (counts) and highest earning (per currency; money only where permitted). */
export function ServicesView({ current }: { current: ServicesData }) {
  const { t, i18n } = useTranslation();
  if (current.mostBooked.length === 0 && current.highestEarning.length === 0) {
    return <EmptyState compact title={t('advReports.services.none')} />;
  }
  const maxBooked = Math.max(0, ...current.mostBooked.map((s) => s.booked));
  const currencies = [...new Set(current.highestEarning.map((s) => s.currency))].sort();
  return (
    <View style={reportStyles.stack}>
      <Card>
        <Text variant="cardTitle">{t('advReports.services.mostBooked')}</Text>
        <View style={reportStyles.stack}>
          {current.mostBooked.map((s) => (
            <BarRow
              key={s.serviceId}
              label={s.name}
              valueText={t('advReports.services.booked', { count: s.booked })}
              value={s.booked}
              max={maxBooked}
            />
          ))}
        </View>
      </Card>
      {currencies.map((currency) => {
        const rows = current.highestEarning.filter((s) => s.currency === currency);
        const max = Math.max(0, ...rows.map((s) => s.netMinor));
        return (
          <Card key={currency}>
            <Text variant="cardTitle">
              {t('advReports.services.highestEarning')} · {currency}
            </Text>
            <View style={reportStyles.stack}>
              {rows.map((s) => (
                <BarRow
                  key={s.serviceId}
                  label={s.name}
                  valueText={formatMinor(s.netMinor, currency, i18n.language)}
                  value={s.netMinor}
                  max={max}
                />
              ))}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
