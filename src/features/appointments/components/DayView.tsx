import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { usePagePadding } from '@/components/layout';
import { Button, ErrorState, Select, Skeleton, Text } from '@/components/ui';
import { StaffColumnsGrid } from '@/components/shared/scheduler/StaffColumnsGrid';
import { type DayColumnAppointment } from '@/components/shared/scheduler/StaffDayColumn';
import { useBranchSchedule } from '@/features/schedule/api/useBranchSchedule';
import { useStaff } from '@/features/staff/api/useStaff';
import { usePermission } from '@/lib/permissions';
import { theme, useBreakpoint } from '@/lib/theme';
import {
  addDaysToLocalDate,
  formatDate,
  todayInZone,
  weekdayOfLocalDate,
  zonedToUtc,
  type IanaTimeZone,
  type LocaleTag,
  type LocalDate,
} from '@/lib/time';

import { calendarAppointmentToRow, useCalendarAppointments } from '../api/useAppointments';
import { useDayShading } from '../api/useDayShading';
import { useMyStaffProfile } from '../api/useMyStaffProfile';
import { minuteOfDayFromTime } from '../timeGrid';
import { type AppointmentRow } from '../types';
import { DateNavButton } from './DateNavButton';

export type DayViewProps = {
  businessId: string | null;
  branchId: string | null;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
  date: LocalDate;
  onChangeDate: (date: LocalDate) => void;
  onPressSlot: (staffId: string | null, minute: number) => void;
  onPressAppointment: (id: string, row: AppointmentRow) => void;
  /**
   * Hide the prev/next/today date row. `WeekView` embeds this component under
   * its own week strip, which already moves the date — two date navigators
   * stacked on one screen.
   */
  hideDateNav?: boolean;
};

export function DayView({
  businessId,
  branchId,
  timeZone,
  locale,
  date,
  onChangeDate,
  onPressSlot,
  onPressAppointment,
  hideDateNav = false,
}: DayViewProps) {
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();
  const pagePadding = usePagePadding();
  const canViewAllStaff = usePermission('calendar.view_all_staff');
  const myStaffProfile = useMyStaffProfile(businessId);
  const staff = useStaff(businessId, branchId, { includeInactive: false });
  const branchSchedule = useBranchSchedule(businessId, branchId);
  const dayShading = useDayShading(businessId, branchId, date, timeZone);
  const calendar = useCalendarAppointments(businessId, branchId, date, date);

  const isOwnScopeOnly = !canViewAllStaff.allowed;
  const allStaff = useMemo(() => staff.data ?? [], [staff.data]);
  const visibleStaff = useMemo(() => {
    if (!isOwnScopeOnly) return allStaff;
    return allStaff.filter((member) => member.id === myStaffProfile.data);
  }, [allStaff, isOwnScopeOnly, myStaffProfile.data]);

  const [mobileStaffId, setMobileStaffId] = useState<string | null>(null);
  const activeStaffId = isOwnScopeOnly
    ? (myStaffProfile.data ?? null)
    : (mobileStaffId ?? visibleStaff[0]?.id ?? null);

  const columnsStaff = isMobile
    ? visibleStaff.filter((member) => member.id === activeStaffId)
    : visibleStaff;

  const dayOfWeek = weekdayOfLocalDate(date);
  const isToday = date === todayInZone(timeZone);
  const nowMinute = isToday ? minuteOfDayFromTime(new Date().toISOString(), timeZone) : null;

  if (calendar.isError) {
    return (
      <ErrorState
        title={t('appointments.loadError')}
        description={calendar.error.message}
        onRetry={() => void calendar.refetch()}
        retryLabel={t('actions.retry')}
      />
    );
  }

  return (
    <View style={styles.container}>
      {hideDateNav ? null : (
        <View style={[styles.dateNav, { paddingHorizontal: pagePadding }]}>
          <DateNavButton
            icon={ChevronLeft}
            label={t('appointments.previousDay')}
            onPress={() => onChangeDate(addDaysToLocalDate(date, -1))}
          />
          <Text variant="bodyStrong" numberOfLines={1} style={styles.dateLabel}>
            {formatDate(zonedToUtc(date, '12:00', timeZone), timeZone, locale, 'full')}
          </Text>
          <DateNavButton
            icon={ChevronRight}
            label={t('appointments.nextDay')}
            onPress={() => onChangeDate(addDaysToLocalDate(date, 1))}
          />
          {!isToday ? (
            <Button variant="ghost" size="sm" onPress={() => onChangeDate(todayInZone(timeZone))}>
              {t('appointments.today')}
            </Button>
          ) : null}
        </View>
      )}

      {isMobile && !isOwnScopeOnly && visibleStaff.length > 1 ? (
        <View style={[styles.staffSwitcher, { marginHorizontal: pagePadding }]}>
          <Select
            options={visibleStaff.map((member) => ({
              value: member.id,
              label: member.displayName,
            }))}
            value={activeStaffId}
            onChange={setMobileStaffId}
          />
        </View>
      ) : null}

      {calendar.isPending ? (
        <View style={{ paddingHorizontal: pagePadding }}>
          <Skeleton height={400} radius="md" />
        </View>
      ) : (
        // Mobile shows exactly ONE staff column, so it flexes to fill the width
        // instead of sitting at a fixed 220px with dead space beside it. There
        // is nothing to scroll to horizontally, so the ScrollView is skipped
        // entirely — a `flex: 1` child inside a horizontal ScrollView collapses.
        <GridScroller isMobile={isMobile}>
          <StaffColumnsGrid
            locale={locale}
            fillWidth={isMobile}
            columnWidth={220}
            columns={columnsStaff.map((member) => {
              const shading = dayShading.data?.get(member.id);
              // A staff member with no individual hours configured for this
              // weekday falls back to the branch's hours, so the column is
              // never shaded fully closed just for missing data entry.
              const workingIntervals =
                shading && shading.workingIntervals.length > 0
                  ? shading.workingIntervals
                  : (branchSchedule.data?.hours
                      .filter((hour) => hour.dayOfWeek === dayOfWeek)
                      .map((hour) => ({
                        startMinute: hour.startMinute,
                        endMinute: hour.endMinute,
                      })) ?? []);

              const appointments: DayColumnAppointment[] = (calendar.data?.rows ?? [])
                .filter((row) => row.staffId === member.id)
                .map((row) => ({
                  id: row.id,
                  startMinute: minuteOfDayFromTime(row.startsAt, timeZone),
                  endMinute: minuteOfDayFromTime(row.endsAt, timeZone),
                  status: row.status,
                  clientName: row.clientName,
                  serviceName: row.serviceName,
                }));

              return {
                staffId: member.id,
                staffName: member.displayName,
                appointments,
                workingIntervals,
                closedIntervals: shading?.closedIntervals ?? [],
                nowMinute: member.id === activeStaffId || !isMobile ? nowMinute : null,
                onPressSlot: (minute: number) => onPressSlot(member.id, minute),
                onPressAppointment: (id: string) => {
                  const row = calendar.data?.rows.find((r) => r.id === id);
                  if (row) onPressAppointment(id, calendarAppointmentToRow(row, branchId ?? ''));
                },
              };
            })}
          />
        </GridScroller>
      )}
    </View>
  );
}

/**
 * Mobile renders the single staff column at full width (no horizontal scroll to
 * offer); tablet/desktop keep fixed-width columns and scroll when they overflow.
 */
function GridScroller({ isMobile, children }: { isMobile: boolean; children: ReactNode }) {
  if (isMobile) return <View style={styles.gridFill}>{children}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: theme.spacing[12],
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  dateLabel: {
    // Shrinks instead of pushing the next/Today buttons off a 320px screen.
    flexShrink: 1,
  },
  staffSwitcher: {
    maxWidth: 280,
  },
  gridFill: {
    flex: 1,
  },
});
