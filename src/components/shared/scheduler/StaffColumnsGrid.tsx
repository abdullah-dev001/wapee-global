import { ScrollView, StyleSheet, View } from 'react-native';

import { DEFAULT_GRID_HOURS, type GridHours } from '@/features/appointments/timeGrid';
import { theme } from '@/lib/theme';
import { type LocaleTag } from '@/lib/time';

import { HourRuler } from './HourRuler';
import { StaffDayColumn, type StaffDayColumnProps } from './StaffDayColumn';

export type StaffColumnsGridProps = {
  columns: Omit<StaffDayColumnProps, 'hours' | 'locale' | 'width'>[];
  hours?: GridHours;
  locale: LocaleTag;
  /** Per-column width, used when `fillWidth` is off. */
  columnWidth?: number;
  /**
   * Let the columns share the remaining width (after the hour ruler) instead of
   * each taking `columnWidth`. Used on mobile, which renders exactly one column:
   * a fixed width there leaves dead space beside the grid.
   *
   * The caller must NOT wrap this in a horizontal ScrollView when `fillWidth` is
   * on — a flexing child inside one collapses to zero.
   */
  fillWidth?: boolean;
};

/**
 * One scrollable time grid: a fixed hour ruler plus one `StaffDayColumn` per
 * staff member, side by side. Vertical scroll is shared (a single ScrollView
 * wraps the ruler and every column); horizontal scroll (when there are more
 * columns than fit) is the caller's job — on mobile that's a staff switcher
 * showing exactly one column, on tablet/desktop all columns render and the
 * OUTER container scrolls horizontally if they overflow.
 */
export function StaffColumnsGrid({
  columns,
  hours = DEFAULT_GRID_HOURS,
  locale,
  columnWidth = 220,
  fillWidth = false,
}: StaffColumnsGridProps) {
  return (
    <ScrollView style={fillWidth ? styles.fill : undefined} showsVerticalScrollIndicator={false}>
      <View style={styles.row}>
        <HourRuler hours={hours} locale={locale} />
        {columns.map((column) => (
          <StaffDayColumn
            key={column.staffId}
            {...column}
            hours={hours}
            locale={locale}
            width={columnWidth}
            fillWidth={fillWidth}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
  },
  fill: {
    flex: 1,
  },
});
