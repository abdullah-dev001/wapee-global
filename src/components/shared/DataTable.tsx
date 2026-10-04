import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { focusRing, theme } from '@/lib/theme';

export type DataTableColumn<TRow> = {
  key: string;
  label: string;
  /** Hidden on tablet (DESIGN_GUIDE §12.15: "City" hides when isCompact). */
  hideOnCompact?: boolean;
  render: (row: TRow) => ReactNode;
};

export type DataTableProps<TRow extends { id: string }> = {
  columns: DataTableColumn<TRow>[];
  rows: readonly TRow[];
  onRowPress?: (row: TRow) => void;
  isCompact?: boolean;
  /** Dims the table during a background refetch rather than swapping to a skeleton. */
  isRefetching?: boolean;
};

/**
 * Desktop table (DESIGN_GUIDE §12.15 — "the only table in the app" there,
 * now the second). `minWidth` forces horizontal scroll rather than
 * cramming columns on a narrower desktop window. The whole row is
 * clickable; there are no per-row action buttons.
 */
export function DataTable<TRow extends { id: string }>({
  columns,
  rows,
  onRowPress,
  isCompact = false,
  isRefetching = false,
}: DataTableProps<TRow>) {
  const visibleColumns = columns.filter((column) => !(isCompact && column.hideOnCompact));

  return (
    <View style={[styles.container, isRefetching ? styles.refetching : null]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        // `flexGrow` lets the table STRETCH to the container width when there is
        // room, while `minWidth` below still forces a horizontal scroll when
        // there is not. Without it the content container hugs `minWidth` and the
        // table stops at 704px however wide the page is.
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.table}>
          <View style={styles.headerRow}>
            {visibleColumns.map((column) => (
              <View key={column.key} style={styles.cell}>
                <Text variant="caption" color="textMuted" style={styles.headerLabel}>
                  {column.label}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((row) => (
            <DataTableRow
              key={row.id}
              row={row}
              columns={visibleColumns}
              onPress={onRowPress ? () => onRowPress(row) : undefined}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DataTableRow<TRow extends { id: string }>({
  row,
  columns,
  onPress,
}: {
  row: TRow;
  columns: DataTableColumn<TRow>[];
  onPress?: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      style={[
        styles.row,
        showHover && onPress ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      {columns.map((column) => (
        <View key={column.key} style={styles.cell}>
          {typeof column.render(row) === 'string' ? (
            <Text variant="body" numberOfLines={1}>
              {column.render(row)}
            </Text>
          ) : (
            column.render(row)
          )}
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.radius.lg,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  refetching: {
    opacity: 0.6,
  },
  scrollContent: {
    flexGrow: 1,
  },
  table: {
    flex: 1,
    minWidth: 704, // 44rem, DESIGN_GUIDE §12.15 — the floor, not the width
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  headerLabel: {
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.borderSubtle,
    minHeight: theme.layout.minTouchTarget,
  },
  cell: {
    flex: 1,
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    justifyContent: 'center',
  },
});
