import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StatusBadge, type AppointmentStatus } from '@/components/shared/StatusBadge';
import { Text } from '@/components/ui';
import {
  type GridHours,
  gridHeightPx,
  HOUR_HEIGHT_PX,
  layoutOverlappingBlocks,
  minuteToOffsetPx,
} from '@/features/appointments/timeGrid';
import { theme } from '@/lib/theme';
import { type LocaleTag, type MinuteOfDay } from '@/lib/time';

export type DayColumnAppointment = {
  id: string;
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
  status: AppointmentStatus;
  clientName: string;
  serviceName: string;
};

export type ShadedInterval = { startMinute: MinuteOfDay; endMinute: MinuteOfDay };

export type StaffDayColumnProps = {
  staffId: string;
  staffName: string;
  appointments: DayColumnAppointment[];
  /** Working-hours intervals (unshaded = open); outside them is shaded closed. */
  workingIntervals: ShadedInterval[];
  /** Breaks/time off within working hours; shaded closed even inside working hours. */
  closedIntervals?: ShadedInterval[];
  hours?: GridHours;
  /** Minute-of-day "now" is at, in the branch zone — null hides the line (not today). */
  nowMinute?: number | null;
  onPressSlot: (minute: MinuteOfDay) => void;
  onPressAppointment: (appointmentId: string) => void;
  width?: number;
  /** Fill the remaining width instead of using `width` (a single mobile column). */
  fillWidth?: boolean;
  locale: LocaleTag;
};

const STATUS_BORDER: Record<AppointmentStatus, keyof typeof theme.colors> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'info',
  cancelled: 'error',
  no_show: 'textMuted',
};

/** One staff member's vertical day column: shaded hours, blocks, current-time line. */
export function StaffDayColumn({
  staffName,
  appointments,
  workingIntervals,
  closedIntervals = [],
  hours,
  nowMinute,
  onPressSlot,
  onPressAppointment,
  width = 220,
  fillWidth = false,
  locale,
}: StaffDayColumnProps) {
  const laidOut = useMemo(
    () =>
      layoutOverlappingBlocks(
        appointments.map((appointment) => ({
          id: appointment.id,
          startMinute: appointment.startMinute,
          endMinute: appointment.endMinute,
        })),
      ),
    [appointments],
  );
  const byId = useMemo(() => new Map(appointments.map((a) => [a.id, a])), [appointments]);

  const closedShading = useMemo(() => {
    // Everything outside the union of working intervals, plus explicit closed
    // intervals inside them (breaks/time off), rendered as shaded bands.
    if (workingIntervals.length === 0) {
      return [{ startMinute: 0, endMinute: 24 * 60 }];
    }
    const sorted = [...workingIntervals].sort((a, b) => a.startMinute - b.startMinute);
    const bands: ShadedInterval[] = [];
    let cursor = 0;
    for (const interval of sorted) {
      if (interval.startMinute > cursor) {
        bands.push({ startMinute: cursor, endMinute: interval.startMinute });
      }
      cursor = Math.max(cursor, interval.endMinute);
    }
    bands.push({ startMinute: cursor, endMinute: 24 * 60 });
    return [...bands, ...closedIntervals];
  }, [workingIntervals, closedIntervals]);

  return (
    <View style={[styles.column, fillWidth ? styles.columnFill : { width }]}>
      <View style={styles.header}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {staffName}
        </Text>
      </View>
      <Pressable
        style={[styles.grid, { height: gridHeightPx(hours) }]}
        onPress={(event) => {
          const minute = minuteFromTapY(event.nativeEvent.locationY, hours);
          onPressSlot(minute);
        }}
      >
        {closedShading.map((band, index) => (
          <View
            key={`closed-${index}`}
            pointerEvents="none"
            style={[
              styles.closedBand,
              {
                top: minuteToOffsetPx(band.startMinute, hours),
                height: Math.max(
                  0,
                  minuteToOffsetPx(band.endMinute, hours) -
                    minuteToOffsetPx(band.startMinute, hours),
                ),
              },
            ]}
          />
        ))}

        {typeof nowMinute === 'number' ? (
          <View
            pointerEvents="none"
            style={[styles.nowLine, { top: minuteToOffsetPx(nowMinute, hours) }]}
          />
        ) : null}

        {laidOut.map((block) => {
          const appointment = byId.get(block.id);
          if (!appointment) return null;
          const top = minuteToOffsetPx(block.startMinute, hours);
          const height = Math.max(
            HOUR_HEIGHT_PX / 4,
            minuteToOffsetPx(block.endMinute, hours) - top,
          );
          const columnWidth = 100 / block.columnCount;

          return (
            <Pressable
              key={block.id}
              accessibilityRole="button"
              accessibilityLabel={`${appointment.clientName}, ${appointment.serviceName}`}
              onPress={() => onPressAppointment(block.id)}
              style={[
                styles.block,
                {
                  top,
                  height,
                  left: `${block.column * columnWidth}%`,
                  width: `${columnWidth}%`,
                  borderLeftColor: theme.colors[STATUS_BORDER[appointment.status]],
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <Text variant="small" numberOfLines={1}>
                {formatTimeRange(appointment.startMinute, appointment.endMinute, locale)}
              </Text>
              <Text variant="bodyStrong" numberOfLines={1}>
                {appointment.clientName}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {appointment.serviceName}
              </Text>
              {appointment.status !== 'confirmed' ? (
                <View style={styles.blockBadge}>
                  <StatusBadge status={appointment.status} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Pressable>
    </View>
  );
}

function minuteFromTapY(locationY: number, hours?: GridHours): MinuteOfDay {
  // Inlined here (not imported) to avoid a circular import between the pure
  // module and the component; `offsetPxToMinute` already does this exact job.
  const gridStartMinute = (hours?.startHour ?? 7) * 60;
  const gridEndMinute = (hours?.endHour ?? 21) * 60;
  const minute = gridStartMinute + (locationY / HOUR_HEIGHT_PX) * 60;
  return Math.max(gridStartMinute, Math.min(gridEndMinute, Math.round(minute / 15) * 15));
}

function formatTimeRange(
  startMinute: MinuteOfDay,
  endMinute: MinuteOfDay,
  locale: LocaleTag,
): string {
  // These are minute-of-day values, not instants, so format directly rather
  // than going through `formatTime` (which takes a UTC instant).
  const fmt = (minute: number) => {
    const hour = Math.floor(minute / 60);
    const min = minute % 60;
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, hour, min)));
  };
  return `${fmt(startMinute)} – ${fmt(endMinute)}`;
}

const styles = StyleSheet.create({
  column: {
    borderRightWidth: theme.borderWidth.hairline,
    borderRightColor: theme.colors.borderSubtle,
  },
  columnFill: {
    flex: 1,
  },
  header: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[8],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  grid: {
    position: 'relative',
    backgroundColor: theme.colors.background,
  },
  closedBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surfaceHover,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: theme.colors.error,
    zIndex: 1,
  },
  block: {
    position: 'absolute',
    borderLeftWidth: 3,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    overflow: 'hidden',
    gap: 1,
  },
  blockBadge: {
    marginTop: theme.spacing[2],
  },
});
