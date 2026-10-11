import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import {
  DEFAULT_GRID_HOURS,
  gridHeightPx,
  hourLabelOffsets,
  type GridHours,
} from '@/features/appointments/timeGrid';
import { theme } from '@/lib/theme';
import { type LocaleTag } from '@/lib/time';

export type HourRulerProps = {
  hours?: GridHours;
  locale: LocaleTag;
  width?: number;
};

/** Half the label's own height: the label is centred ON its hour line. */
const LABEL_HALF_HEIGHT = 8;

/**
 * Fixed left-hand column of hour labels. Each label is positioned absolutely at the
 * same pixel offset the cards use (`hourLabelOffsets` -> `minuteToOffsetPx`), so a
 * 12:00 appointment starts exactly at the 12 PM label.
 */
export function HourRuler({ hours = DEFAULT_GRID_HOURS, locale, width = 56 }: HourRulerProps) {
  return (
    <View style={[styles.column, { width }]}>
      <View style={styles.headerSpacer} />
      {/* Extra room below so the last label is not cut off. */}
      <View style={{ height: gridHeightPx(hours) + LABEL_HALF_HEIGHT * 2 }}>
        {hourLabelOffsets(hours).map(({ hour, topPx }) => (
          <View key={hour} style={[styles.label, { top: topPx - LABEL_HALF_HEIGHT }]}>
            <Text variant="caption" color="textMuted">
              {formatHour(hour, locale)}
            </Text>
          </View>
        ))}
      </View>
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
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: LABEL_HALF_HEIGHT * 2,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: theme.spacing[6],
  },
});
