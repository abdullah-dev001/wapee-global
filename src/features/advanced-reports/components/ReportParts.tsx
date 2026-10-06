import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { barWidth, deltaBp, formatDelta, trendOf } from '../reportLogic';

/** Which way is "good": more revenue is good, more cancellations is not. */
export type Good = 'up' | 'down';

/** A figure with its change against the previous period. */
export function CompareStat({
  label,
  value,
  hint,
  current,
  previous,
  good = 'up',
}: {
  label: string;
  value: string;
  hint?: string;
  current: number;
  previous: number;
  good?: Good;
}) {
  const { t } = useTranslation();
  const delta = deltaBp(current, previous);
  const trend = trendOf(delta);
  const tone =
    trend === 'none' || trend === 'flat'
      ? 'neutral'
      : (trend === 'up') === (good === 'up')
        ? 'success'
        : 'error';
  return (
    <Card style={styles.stat}>
      <Text variant="helper" color="textSecondary">
        {label}
      </Text>
      <Text variant="statValue">{value}</Text>
      {hint ? (
        <Text variant="helper" color="textMuted">
          {hint}
        </Text>
      ) : null}
      <View style={styles.deltaRow}>
        <Badge tone={tone}>{trend === 'none' ? t('advReports.noBase') : formatDelta(delta)}</Badge>
        {trend !== 'none' ? (
          <Text variant="helper" color="textMuted">
            {t('advReports.vsPrevious')}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** A labelled horizontal bar (plain Views, no chart library). */
export function BarRow({
  label,
  valueText,
  value,
  max,
}: {
  label: string;
  valueText: string;
  value: number;
  max: number;
}) {
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text variant="body" numberOfLines={1} style={styles.barLabel}>
          {label}
        </Text>
        <Text variant="bodyStrong">{valueText}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${barWidth(value, max)}%` }]} />
      </View>
    </View>
  );
}

/** One thin vertical bar per day. The first and last dates are labelled. */
export function DailyBars({
  points,
  accessibilityLabel,
}: {
  points: readonly { date: string; value: number }[];
  accessibilityLabel: string;
}) {
  const max = Math.max(0, ...points.map((p) => p.value));
  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.daily}>
        {points.map((p) => (
          <View key={p.date} style={styles.dailySlot}>
            <View style={[styles.dailyBar, { height: `${barWidth(p.value, max)}%` }]} />
          </View>
        ))}
      </View>
      <View style={styles.dailyAxis}>
        <Text variant="caption" color="textMuted">
          {points[0]?.date.slice(5)}
        </Text>
        <Text variant="caption" color="textMuted">
          {points[points.length - 1]?.date.slice(5)}
        </Text>
      </View>
    </View>
  );
}

export const reportStyles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[12] },
});

const styles = StyleSheet.create({
  stat: { flexGrow: 1, flexBasis: 220, gap: theme.spacing[4] },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    marginTop: theme.spacing[4],
  },
  barRow: { gap: theme.spacing[4] },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  barLabel: { flex: 1 },
  track: {
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderSubtle,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary },
  daily: { flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 2 },
  dailySlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  dailyBar: { width: '100%', minHeight: 1, borderRadius: 2, backgroundColor: theme.colors.primary },
  dailyAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing[4] },
});
