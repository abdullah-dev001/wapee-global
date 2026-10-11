import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Input, Text } from '@/components/ui';
import { theme } from '@/lib/theme';
import { type IanaTimeZone, type LocalDate } from '@/lib/time';

import { Calendar } from './Calendar';

export type DateRangePickerProps = {
  /** "YYYY-MM-DD", or null for nothing chosen. */
  startDate: LocalDate | null;
  endDate: LocalDate | null;
  onChange: (range: { startDate: LocalDate | null; endDate: LocalDate | null }) => void;
  startLabel?: string;
  endLabel?: string;
  /** Earliest selectable date, "YYYY-MM-DD". */
  minDate?: LocalDate;
  /** Latest selectable date. */
  maxDate?: LocalDate;
  /**
   * Timezone that decides "today" in the calendar. **The branch timezone**
   * (decision 23). Defaults to UTC so a caller that has not got one yet still
   * renders, but every real caller should pass it.
   */
  timeZone?: IanaTimeZone;
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
 * - **Web** uses two `<input type="date">` fields, which gives the browser's own
 *   calendar, keyboard support and locale formatting for free.
 * - **Native** shows the shared `Calendar` month grid, because there is no such
 *   control and a native module would mean a rebuild.
 *
 * Tapping picks the start, then the end; tapping again after a complete range
 * starts a new one.
 */
export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  startLabel,
  endLabel,
  minDate,
  maxDate,
  timeZone = 'UTC',
  error,
  required = false,
  disabled = false,
}: DateRangePickerProps) {
  const { t, i18n } = useTranslation();

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

  /** One tap in the grid: first sets the start, the next completes the range. */
  const pick = (date: LocalDate) => {
    if (disabled) return;
    const startingFresh = startDate === null || endDate !== null;
    if (startingFresh) {
      onChange({ startDate: date, endDate: null });
      return;
    }
    // Tapping before the start moves the start rather than making an inverted range.
    if (startDate !== null && date < startDate) {
      onChange({ startDate: date, endDate: null });
      return;
    }
    onChange({ startDate, endDate: date });
  };

  const summaryFormatter = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    // UTC: these are calendar dates read back as UTC midnights.
    timeZone: 'UTC',
  });
  const summarise = (date: LocalDate | null) =>
    date ? summaryFormatter.format(new Date(`${date}T00:00:00.000Z`)) : '—';

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.fields}>
          <View style={styles.field}>
            <Input
              {...({ type: 'date', min: minDate, max: maxDate } as object)}
              label={startLabel ?? t('schedule.startDate')}
              value={startDate ?? ''}
              onChangeText={(next) => commit('start', next)}
              placeholder="YYYY-MM-DD"
              required={required}
              editable={!disabled}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Input
              {...({ type: 'date', min: startDate ?? minDate, max: maxDate } as object)}
              label={endLabel ?? t('schedule.endDate')}
              value={endDate ?? ''}
              onChangeText={(next) => commit('end', next)}
              placeholder="YYYY-MM-DD"
              required={required}
              editable={!disabled}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {error ? (
          <Text variant="helper" color="error">
            {error}
          </Text>
        ) : null}
      </View>
    );
  }

  // Native: the shared month grid.
  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text variant="label">{startLabel ?? t('schedule.startDate')}</Text>
        <Text variant="body">{summarise(startDate)}</Text>
        <Text variant="label" style={styles.summarySpacer}>
          {endLabel ?? t('schedule.endDate')}
        </Text>
        <Text variant="body">{summarise(endDate)}</Text>
      </View>

      <Calendar
        value={startDate}
        rangeEnd={endDate}
        onChange={pick}
        // No implicit "today" floor: a caller decides whether past dates are
        // allowed (a closure can be recorded late; time off cannot be booked
        // in the past).
        minDate={minDate}
        maxDate={maxDate}
        timeZone={timeZone}
      />

      {error ? (
        <Text variant="helper" color="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[8],
  },
  fields: {
    flexDirection: 'row',
    gap: theme.spacing[8],
  },
  field: {
    flex: 1,
    minWidth: 0,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
    flexWrap: 'wrap',
  },
  summarySpacer: {
    marginStart: theme.spacing[8],
  },
});
