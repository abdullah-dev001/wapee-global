import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import {
  DEFAULT_GRID_HOURS,
  HOUR_HEIGHT_PX,
  type GridHours,
} from '@/features/appointments/timeGrid';
import { theme } from '@/lib/theme';
import { type LocaleTag } from '@/lib/time';

export type HourRulerProps = {
  hours?: GridHours;
  locale: LocaleTag;
  width?: number;
};

/** Fixed left-hand column of hour labels, aligned to the same row height as the staff columns. */
export function HourRuler({ hours = DEFAULT_GRID_HOURS, locale, width = 56 }: HourRulerProps) {
  const rows = Array.from(
    { length: hours.endHour - hours.startHour + 1 },
    (_, index) => hours.startHour + index,
  );

  return (
    <View style={[styles.column, { width }]}>
      <View style={styles.headerSpacer} />
      {rows.map((hour) => (
        <View key={hour} style={styles.row}>
          <Text variant="caption" color="textMuted">
            {formatHour(hour, locale)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function formatHour(hour: number, locale: LocaleTag): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, 0, 1, hour)),
  );
}

const styles = StyleSheet.create({
  column: {
    borderRightWidth: theme.borderWidth.hairline,
    borderRightColor: theme.colors.border,
  },
  headerSpacer: {
    height: 40,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  row: {
    height: HOUR_HEIGHT_PX,
    alignItems: 'flex-end',
    paddingRight: theme.spacing[6],
    marginTop: -8,
  },
});
