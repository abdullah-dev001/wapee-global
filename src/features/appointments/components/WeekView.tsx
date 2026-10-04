import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { usePagePadding } from '@/components/layout';
import { Text } from '@/components/ui';
import { localeWeekStart } from '@/components/shared/calendarGrid';
import { theme } from '@/lib/theme';
import {
  addDaysToLocalDate,
  todayInZone,
  weekdayOfLocalDate,
  zonedToUtc,
  type IanaTimeZone,
  type LocaleTag,
  type LocalDate,
} from '@/lib/time';

import { type AppointmentRow } from '../types';
import { DateNavButton } from './DateNavButton';
import { DayView } from './DayView';

export type WeekViewProps = {
  businessId: string | null;
  branchId: string | null;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
  /** Any date inside the week to show; the strip aligns to the locale's week start. */
  weekStartDate: LocalDate;
  onChangeWeekStart: (date: LocalDate) => void;
  onPressSlot: (staffId: string | null, date: LocalDate, minute: number) => void;
  onPressAppointment: (id: string, row: AppointmentRow) => void;
};

/**
 * Week view: a 7-day quick-switch strip above the SAME per-staff day grid
 * `DayView` renders — "one column per staff" (doc §6.3) stays literally true
 * for both Day and Week; Week only makes jumping between the week's days
 * faster than Day's one-at-a-time prev/next.
 */
export function WeekView({
  businessId,
  branchId,
  timeZone,
  locale,
  weekStartDate,
  onChangeWeekStart,
  onPressSlot,
  onPressAppointment,
}: WeekViewProps) {
  const { t } = useTranslation();
  const today = todayInZone(timeZone);

  const weekStart = useMemo(() => {
    const firstDay = localeWeekStart(locale);
    const offset = (weekdayOfLocalDate(weekStartDate) - firstDay + 7) % 7;
    return addDaysToLocalDate(weekStartDate, -offset);
  }, [weekStartDate, locale]);

  const [selectedDay, setSelectedDay] = useState(weekStartDate);
  const pagePadding = usePagePadding();

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysToLocalDate(weekStart, index)),
    [weekStart],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.nav, { paddingHorizontal: pagePadding }]}>
        <DateNavButton
          icon={ChevronLeft}
          label={t('appointments.previousWeek')}
          onPress={() => {
            const prevWeek = addDaysToLocalDate(weekStart, -7);
            onChangeWeekStart(prevWeek);
            setSelectedDay(prevWeek);
          }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
          {days.map((day) => (
            <DayChip
              key={day}
              day={day}
              timeZone={timeZone}
              locale={locale}
              isToday={day === today}
              isSelected={day === selectedDay}
              onPress={() => setSelectedDay(day)}
            />
          ))}
        </ScrollView>
        <DateNavButton
          icon={ChevronRight}
          label={t('appointments.nextWeek')}
          onPress={() => {
            const nextWeek = addDaysToLocalDate(weekStart, 7);
            onChangeWeekStart(nextWeek);
            setSelectedDay(nextWeek);
          }}
        />
      </View>

      <DayView
        businessId={businessId}
        branchId={branchId}
        timeZone={timeZone}
        locale={locale}
        date={selectedDay}
        onChangeDate={setSelectedDay}
        onPressSlot={(staffId, minute) => onPressSlot(staffId, selectedDay, minute)}
        onPressAppointment={onPressAppointment}
        hideDateNav
      />
    </View>
  );
}

function DayChip({
  day,
  timeZone,
  locale,
  isToday,
  isSelected,
  onPress,
}: {
  day: LocalDate;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
  isToday: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(
    new Date(zonedToUtc(day, '12:00', timeZone)),
  );
  const dayNumber = day.slice(-2);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      style={[styles.chip, isSelected ? styles.chipSelected : null]}
    >
      <Text variant="caption" color={isSelected ? 'textOnPrimary' : 'textSecondary'}>
        {weekdayLabel}
      </Text>
      <Text
        variant="bodyStrong"
        color={isSelected ? 'textOnPrimary' : isToday ? 'primary' : 'textPrimary'}
      >
        {dayNumber}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  strip: {
    flex: 1,
  },
  chip: {
    width: 44,
    minHeight: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing[2],
    gap: theme.spacing[2],
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
  },
});
