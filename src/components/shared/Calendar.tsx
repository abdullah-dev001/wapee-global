import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { isRtl } from '@/lib/i18n/direction';
import { focusRing, theme } from '@/lib/theme';
import {
  parseLocalDate,
  todayInZone,
  toLocalDate,
  type IanaTimeZone,
  type LocalDate,
} from '@/lib/time';

import {
  DAYS_PER_WEEK,
  buildCalendarGrid,
  gridRows,
  lastDayOfMonth,
  localeWeekStart,
  shiftMonth as shiftMonthBy,
  type DayCell,
} from './calendarGrid';

export type CalendarProps = {
  /** The chosen day, or the range start when `rangeEnd` is given. */
  value: LocalDate | null;
  onChange: (date: LocalDate) => void;
  /** Range mode: the end of the selected range. */
  rangeEnd?: LocalDate | null;
  /** Earliest selectable day, inclusive. */
  minDate?: LocalDate;
  /** Latest selectable day, inclusive. */
  maxDate?: LocalDate;
  /**
   * Days that cannot be chosen even inside min/max — a closed branch, a fully
   * booked day. The booking page (Phase 3) will pass its unavailable days here.
   */
  disabledDates?: readonly LocalDate[];
  /**
   * Timezone that decides what "today" is. **Always the branch timezone**
   * (decision 23), never the device's.
   */
  timeZone: IanaTimeZone;
  /** Month shown first. Defaults to the value's month, else today's. */
  initialMonth?: LocalDate;
};

/**
 * Month grid, built by hand so there is **no new dependency** and one component
 * serves Android, iOS and web.
 *
 * - **Branch timezone** decides "today" (decision 23), never the device.
 * - **RTL-ready**: the arrows swap, and the grid is laid out with `row-reverse`
 *   for RTL languages rather than relying on `I18nManager`, which needs an app
 *   reload on native to take effect.
 * - Weekday headers and month names come from `Intl`, so every language works
 *   with no translation files.
 * - Reused by the Phase 3 public booking page, which is why `disabledDates`
 *   exists: a day the branch is closed or fully booked.
 */
export function Calendar({
  value,
  onChange,
  rangeEnd = null,
  minDate,
  maxDate,
  disabledDates,
  timeZone,
  initialMonth,
}: CalendarProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rtl = isRtl(locale);
  const today = todayInZone(timeZone);

  // Which month is on screen, as its first day.
  const [visibleMonth, setVisibleMonth] = useState<LocalDate>(() => {
    const anchor = initialMonth ?? value ?? today;
    const parsed = parseLocalDate(anchor) ?? parseLocalDate(today);
    return parsed ? toLocalDate(parsed.year, parsed.month, 1) : today;
  });

  const disabledSet = useMemo(() => new Set(disabledDates ?? []), [disabledDates]);

  const { cells, monthLabel, weekdayLabels, canGoBack, canGoForward } = useMemo(() => {
    const weekStart = localeWeekStart(locale);
    const month = parseLocalDate(visibleMonth);
    const firstOfMonth = month ? toLocalDate(month.year, month.month, 1) : visibleMonth;

    const built = buildCalendarGrid({
      visibleMonth,
      today,
      weekStart,
      selected: value,
      rangeEnd,
      minDate,
      maxDate,
      disabled: disabledSet,
    });

    // UTC on both formatters: the reference instants are UTC midnights, and a
    // local-time formatter on a negative-offset device would render the previous
    // day — which would show the wrong month name on the 1st.
    const label = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${firstOfMonth}T00:00:00.000Z`));

    const weekdayFormatter = new Intl.DateTimeFormat(locale, {
      weekday: 'narrow',
      timeZone: 'UTC',
    });
    const headers = Array.from({ length: DAYS_PER_WEEK }, (_, offset) => {
      // 2026-11-01 is a Sunday, so adding the weekday number lands on that day.
      const weekday = (weekStart + offset) % DAYS_PER_WEEK;
      return weekdayFormatter.format(new Date(Date.UTC(2026, 10, 1 + weekday)));
    });

    const lastOfMonth = lastDayOfMonth(visibleMonth) ?? firstOfMonth;

    return {
      cells: built,
      monthLabel: label,
      weekdayLabels: headers,
      // Do not let someone page into a month they can never pick from.
      canGoBack: minDate === undefined || firstOfMonth > minDate,
      canGoForward: maxDate === undefined || lastOfMonth < maxDate,
    };
  }, [visibleMonth, today, locale, value, rangeEnd, minDate, maxDate, disabledSet]);

  const shiftMonth = (delta: number) => setVisibleMonth(shiftMonthBy(visibleMonth, delta));

  // In RTL the "previous" arrow points right.
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;

  const rowDirection = rtl ? 'row-reverse' : 'row';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <MonthButton
          icon={PrevIcon}
          label={t('actions.previousMonth')}
          disabled={!canGoBack}
          onPress={() => shiftMonth(-1)}
        />
        <Text variant="bodyStrong" align="center" style={styles.monthLabel} numberOfLines={1}>
          {monthLabel}
        </Text>
        <MonthButton
          icon={NextIcon}
          label={t('actions.nextMonth')}
          disabled={!canGoForward}
          onPress={() => shiftMonth(1)}
        />
      </View>

      <View style={[styles.weekdays, { flexDirection: rowDirection }]}>
        {weekdayLabels.map((label, index) => (
          <View key={index} style={styles.cell}>
            <Text variant="caption" color="textMuted" align="center" maxFontSizeMultiplier={1.2}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View>
        {gridRows(cells).map((row) => (
          <View key={row[0]?.date ?? ''} style={[styles.week, { flexDirection: rowDirection }]}>
            {row.map((cell) => (
              <DayButton key={cell.date} cell={cell} onPress={() => onChange(cell.date)} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function MonthButton({
  icon: Icon,
  label,
  disabled,
  onPress,
}: {
  icon: typeof ChevronLeft;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        styles.monthButton,
        showHover && !disabled ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
        disabled ? { opacity: theme.opacity.disabled } : null,
      ]}
    >
      <Icon
        size={theme.iconSize.lg}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textPrimary}
      />
    </Pressable>
  );
}

function DayButton({ cell, onPress }: { cell: DayCell; onPress: () => void }) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  // An empty cell outside the month still occupies its column.
  if (!cell.inMonth) return <View style={styles.cell} />;

  const selected = cell.isSelected;
  const background = selected
    ? theme.colors.primary
    : cell.isInRange
      ? theme.colors.primaryLight
      : showHover && !cell.isDisabled
        ? theme.colors.surfaceHover
        : theme.colors.transparent;

  const color = selected
    ? theme.colors.textOnPrimary
    : cell.isDisabled
      ? theme.colors.textMuted
      : cell.isInRange
        ? theme.colors.primary
        : theme.colors.textPrimary;

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      disabled={cell.isDisabled}
      accessibilityRole="button"
      accessibilityLabel={cell.date}
      accessibilityState={{ disabled: cell.isDisabled, selected }}
      style={styles.cell}
    >
      <View
        style={[
          styles.day,
          { backgroundColor: background },
          // Today is outlined rather than filled, so it never looks selected.
          cell.isToday && !selected ? styles.todayRing : null,
          showFocusRing ? focusRing() : null,
          cell.isDisabled ? { opacity: theme.opacity.disabled } : null,
        ]}
      >
        <Text
          variant={selected || cell.isToday ? 'bodyStrong' : 'body'}
          align="center"
          maxFontSizeMultiplier={1.3}
          style={{ color }}
        >
          {String(cell.dayOfMonth)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[4],
  },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  monthLabel: {
    flex: 1,
  },
  monthButton: {
    width: theme.layout.minTouchTarget,
    height: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
  },
  weekdays: {
    paddingBottom: theme.spacing[4],
  },
  week: {
    // No gap: each cell is a flex column, so the grid stays square-ish at any
    // width without measuring.
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // 44px targets on a phone; the aspect ratio keeps them square.
    minHeight: theme.layout.minTouchTarget,
  },
  day: {
    width: '86%',
    aspectRatio: 1,
    maxHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
  },
  todayRing: {
    borderWidth: theme.borderWidth.thick,
    borderColor: theme.colors.primary,
  },
});
