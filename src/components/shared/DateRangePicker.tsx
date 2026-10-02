import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Input, Text } from '@/components/ui';
import { theme } from '@/lib/theme';
import { type LocalDate } from '@/lib/time';

export type DateRangePickerProps = {
  /** "YYYY-MM-DD", or null for nothing chosen. */
  startDate: LocalDate | null;
  endDate: LocalDate | null;
  onChange: (range: { startDate: LocalDate | null; endDate: LocalDate | null }) => void;
  startLabel?: string;
  endLabel?: string;
  /** Earliest selectable date, "YYYY-MM-DD". */
  minDate?: LocalDate;
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

/** "YYYY-MM-DD" and a real calendar date. */
function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Rejects 2026-02-30: the Date would roll over to March.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * A start and end calendar date, for time off and branch closures.
 *
 * **Dates, not instants.** "Closed on 25 December" is a calendar fact, so these
 * are `LocalDate` strings and never `timestamptz` — the same reason
 * `branch_closures` stores `date` (see context/schedule.md).
 *
 * On web this is two `<input type="date">` fields, which gives the browser's own
 * calendar for free. On native there is no such control, and a real calendar
 * would mean a new native module, so the fields accept typed "YYYY-MM-DD" with a
 * hint. **A visual calendar for native is still to do** — noted in
 * context/schedule.md; it needs either a library (ask first) or a hand-built
 * month grid.
 */
export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  startLabel,
  endLabel,
  minDate,
  error,
  required = false,
  disabled = false,
}: DateRangePickerProps) {
  const { t } = useTranslation();

  // On web the native date input emits a valid value or an empty string.
  const webProps = Platform.OS === 'web' ? ({ type: 'date', min: minDate } as object) : {};

  const commit = (which: 'start' | 'end', raw: string) => {
    const value = raw.trim() === '' ? null : raw.trim();
    // Hold a partially typed date without reporting it as a change.
    if (value !== null && !isValidLocalDate(value)) return;

    if (which === 'start') {
      // An end before the start is never valid; pull it along.
      const nextEnd = value && endDate && endDate < value ? value : endDate;
      onChange({ startDate: value, endDate: nextEnd });
    } else {
      onChange({ startDate, endDate: value });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.fields}>
        <View style={styles.field}>
          <Input
            {...webProps}
            label={startLabel ?? t('schedule.startDate')}
            value={startDate ?? ''}
            onChangeText={(next) => commit('start', next)}
            placeholder="YYYY-MM-DD"
            required={required}
            editable={!disabled}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
          />
        </View>

        <View style={styles.field}>
          <Input
            {...webProps}
            label={endLabel ?? t('schedule.endDate')}
            value={endDate ?? ''}
            onChangeText={(next) => commit('end', next)}
            placeholder="YYYY-MM-DD"
            required={required}
            editable={!disabled}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
          />
        </View>
      </View>

      {error ? (
        <Text variant="helper" color="error">
          {error}
        </Text>
      ) : Platform.OS === 'web' ? null : (
        <Text variant="helper" color="textMuted">
          {t('schedule.dateFormatHint')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[6],
  },
  fields: {
    flexDirection: 'row',
    gap: theme.spacing[8],
  },
  field: {
    flex: 1,
    minWidth: 0,
  },
});
