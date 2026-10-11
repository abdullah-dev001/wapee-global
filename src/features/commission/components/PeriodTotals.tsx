import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';
import { theme } from '@/lib/theme';

import { type ReportRow } from '../commissionLogic';

/** Earned / taken back / net for ONE currency. Never merged with another currency's. */
export function CurrencyBlock({
  row,
}: {
  row: Pick<ReportRow, 'currency' | 'earnedMinor' | 'reversedMinor' | 'netMinor'>;
}) {
  const { t, i18n } = useTranslation();
  const money = (minor: number) => formatMinor(minor, row.currency, i18n.language);
  return (
    <Card>
      <Text variant="helper" color="textSecondary">
        {row.currency}
      </Text>
      <Text variant="statValue">{money(row.netMinor)}</Text>
      <View style={styles.line}>
        <Text variant="helper" color="textSecondary">
          {t('commission.earned')} {money(row.earnedMinor)}
        </Text>
        <Text variant="helper" color="textSecondary">
          {t('commission.reversed')} {money(row.reversedMinor)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[12] },
});
