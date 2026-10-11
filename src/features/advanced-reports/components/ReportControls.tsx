import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Input, Select, SegmentedControl, Text } from '@/components/ui';
import { stepIcons } from '@/lib/i18n/stepIcons';
import { theme } from '@/lib/theme';
import { formatDate, type LocalDate, type UtcIso } from '@/lib/time';

import { MAX_CUSTOM_DAYS, resolvePeriod, stepAnchor, type PeriodKind } from '../periodLogic';

export type ControlsState = {
  kind: PeriodKind;
  anchor: LocalDate;
  customFrom: string;
  customTo: string;
  /** The custom range actually applied (typed values are only used on "Apply"). */
  applied: { from: LocalDate; to: LocalDate } | null;
  branchId: string | null;
};

const ALL = 'all';

/** Period kind, previous/next stepping, a custom range and a location filter. */
export function ReportControls({
  state,
  onChange,
  branches,
}: {
  state: ControlsState;
  onChange: (next: ControlsState) => void;
  /** Locations to filter by; empty or one hides the filter. */
  branches: readonly { id: string; name: string }[];
}) {
  const { t, i18n } = useTranslation();
  const { Previous, Next } = stepIcons(i18n.language);
  const period = resolvePeriod(state.kind, state.anchor, state.applied ?? undefined);
  const label = (date: string) =>
    formatDate(`${date}T12:00:00Z` as UtcIso, 'UTC', i18n.language, 'medium');
  const rangeOk =
    resolvePeriod('custom', state.anchor, { from: state.customFrom, to: state.customTo }) !== null;

  return (
    <View style={styles.stack}>
      <SegmentedControl<PeriodKind>
        options={[
          { value: 'weekly', label: t('advReports.period.weekly') },
          { value: 'monthly', label: t('advReports.period.monthly') },
          { value: 'custom', label: t('advReports.period.custom') },
        ]}
        value={state.kind}
        onChange={(kind) => onChange({ ...state, kind })}
      />

      {state.kind === 'custom' ? (
        <View style={styles.stack}>
          <View style={styles.dates}>
            <View style={styles.date}>
              <Input
                label={t('advReports.from')}
                value={state.customFrom}
                onChangeText={(customFrom) => onChange({ ...state, customFrom })}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.date}>
              <Input
                label={t('advReports.to')}
                value={state.customTo}
                onChangeText={(customTo) => onChange({ ...state, customTo })}
                autoCapitalize="none"
              />
            </View>
          </View>
          <Text variant="helper" color={rangeOk ? 'textMuted' : 'error'}>
            {rangeOk
              ? t('advReports.customHint')
              : t('advReports.invalidRange', { days: MAX_CUSTOM_DAYS })}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            disabled={!rangeOk}
            onPress={() =>
              onChange({ ...state, applied: { from: state.customFrom, to: state.customTo } })
            }
          >
            {t('advReports.apply')}
          </Button>
        </View>
      ) : (
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('advReports.previous')}
            onPress={() => onChange({ ...state, anchor: stepAnchorBy(state, -1) })}
            style={styles.arrow}
          >
            <Previous
              size={theme.iconSize.lg}
              strokeWidth={theme.iconStroke}
              color={theme.colors.textPrimary}
            />
          </Pressable>
          <Text variant="cardTitle" style={styles.range}>
            {period
              ? t('advReports.range', { from: label(period.from), to: label(period.to) })
              : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('advReports.next')}
            onPress={() => onChange({ ...state, anchor: stepAnchorBy(state, 1) })}
            style={styles.arrow}
          >
            <Next
              size={theme.iconSize.lg}
              strokeWidth={theme.iconStroke}
              color={theme.colors.textPrimary}
            />
          </Pressable>
        </View>
      )}

      {branches.length > 1 ? (
        <Select
          label={t('advReports.location')}
          options={[
            { value: ALL, label: t('advReports.allLocations') },
            ...branches.map((b) => ({ value: b.id, label: b.name })),
          ]}
          value={state.branchId ?? ALL}
          onChange={(value) => onChange({ ...state, branchId: value === ALL ? null : value })}
        />
      ) : null}
    </View>
  );
}

function stepAnchorBy(state: ControlsState, delta: -1 | 1): LocalDate {
  return stepAnchor(state.kind, state.anchor, delta);
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  range: { flex: 1, textAlign: 'center' },
  arrow: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dates: { flexDirection: 'row', gap: theme.spacing[12] },
  date: { flex: 1 },
});
