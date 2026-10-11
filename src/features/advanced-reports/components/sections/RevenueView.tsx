import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';

import { type RevenueData } from '../../reportTypes';
import { BarRow, CompareStat, DailyBars, reportStyles } from '../ReportParts';

const METHOD_KEYS = {
  cash: 'advReports.revenue.method.cash',
  card: 'advReports.revenue.method.card',
  bank_transfer: 'advReports.revenue.method.bank_transfer',
} as const;

/** One block per currency, each with its own totals, daily trend and payment methods. */
export function RevenueView({
  current,
  previous,
}: {
  current: RevenueData;
  previous: RevenueData;
}) {
  const { t, i18n } = useTranslation();
  return (
    <View style={reportStyles.stack}>
      {current.currencies.map((c) => {
        const p = previous.currencies.find((x) => x.currency === c.currency);
        const money = (minor: number) => formatMinor(minor, c.currency, i18n.language);
        const maxMethod = Math.max(0, ...c.byMethod.map((m) => m.amountMinor));
        return (
          <View key={c.currency} style={reportStyles.stack}>
            <Text variant="sectionTitle">{c.currency}</Text>
            <View style={reportStyles.grid}>
              <CompareStat
                label={t('advReports.revenue.net')}
                hint={t('advReports.revenue.netHint')}
                value={money(c.netRevenueMinor)}
                current={c.netRevenueMinor}
                previous={p?.netRevenueMinor ?? 0}
              />
              <CompareStat
                label={t('advReports.revenue.collected')}
                value={money(c.collectedMinor)}
                current={c.collectedMinor}
                previous={p?.collectedMinor ?? 0}
              />
              <CompareStat
                label={t('advReports.revenue.invoices')}
                value={String(c.invoiceCount)}
                current={c.invoiceCount}
                previous={p?.invoiceCount ?? 0}
              />
              <CompareStat
                label={t('advReports.revenue.discounts')}
                hint={t('advReports.revenue.discountsHint', { count: c.discountedLines })}
                value={money(c.discountsMinor)}
                current={c.discountsMinor}
                previous={p?.discountsMinor ?? 0}
                good="down"
              />
            </View>
            <Card>
              <Text variant="cardTitle">{t('advReports.revenue.trend')}</Text>
              <DailyBars
                points={c.daily.map((d) => ({ date: d.date, value: d.netRevenueMinor }))}
                accessibilityLabel={`${t('advReports.revenue.trend')} ${c.currency}`}
              />
            </Card>
            {c.byMethod.length > 0 ? (
              <Card>
                <Text variant="cardTitle">{t('advReports.revenue.byMethod')}</Text>
                <View style={reportStyles.stack}>
                  {c.byMethod.map((m) => (
                    <BarRow
                      key={m.method}
                      label={
                        Object.prototype.hasOwnProperty.call(METHOD_KEYS, m.method)
                          ? t(METHOD_KEYS[m.method as keyof typeof METHOD_KEYS])
                          : m.method
                      }
                      valueText={money(m.amountMinor)}
                      value={m.amountMinor}
                      max={maxMethod}
                    />
                  ))}
                </View>
              </Card>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
