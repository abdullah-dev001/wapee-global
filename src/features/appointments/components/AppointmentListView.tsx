import { CalendarX } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Avatar, StatusBadge } from '@/components/shared';
import { Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { focusRing, theme } from '@/lib/theme';
import { formatDate, formatTime, type IanaTimeZone, type LocaleTag } from '@/lib/time';

import { type AppointmentListFilters, useAppointmentList } from '../api/useAppointments';
import { type AppointmentRow } from '../types';

export type AppointmentListViewProps = {
  businessId: string | null;
  filters: AppointmentListFilters;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
  onSelect: (appointment: AppointmentRow) => void;
};

/**
 * Server-side paginated list (keyset cursor), mirroring `list_appointments`
 * exactly — filters/search live in the caller (URL params on web, CLAUDE.md
 * §6), this component only renders one page at a time and loads more.
 */
export function AppointmentListView({
  businessId,
  filters,
  timeZone,
  locale,
  onSelect,
}: AppointmentListViewProps) {
  const { t } = useTranslation();
  const query = useAppointmentList(businessId, filters);

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.rows) ?? [], [query.data]);

  if (query.isError) {
    return (
      <ErrorState
        title={t('appointments.loadError')}
        description={query.error.message}
        onRetry={() => void query.refetch()}
        retryLabel={t('actions.retry')}
      />
    );
  }

  if (query.isPending) {
    return (
      <Card noPadding>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={styles.row}>
            <Skeleton height={28} width={28} radius="full" />
            <Skeleton height={16} width="50%" radius="sm" />
          </View>
        ))}
      </Card>
    );
  }

  if (rows.length === 0) {
    const isFiltered = Boolean(
      filters.search || filters.staffId || filters.status || filters.serviceId,
    );
    return (
      <EmptyState
        icon={CalendarX}
        title={isFiltered ? t('appointments.noResults') : t('appointments.noAppointments')}
        description={
          isFiltered ? t('appointments.noResultsHint') : t('appointments.noAppointmentsHint')
        }
      />
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <AppointmentRowItem
          appointment={item}
          timeZone={timeZone}
          locale={locale}
          onPress={() => onSelect(item)}
        />
      )}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
      }
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      ListFooterComponent={query.isFetchingNextPage ? <FooterSpinner /> : null}
      contentContainerStyle={styles.listContent}
    />
  );
}

function FooterSpinner() {
  return (
    <View style={styles.footer}>
      <Skeleton height={16} width="40%" radius="sm" />
    </View>
  );
}

function AppointmentRowItem({
  appointment,
  timeZone,
  locale,
  onPress,
}: {
  appointment: AppointmentRow;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
  onPress: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, showHover ? { opacity: 0.8 } : null, showFocusRing ? focusRing() : null]}
    >
      <Avatar name={appointment.clientName} />
      <View style={styles.rowBody}>
        <View style={styles.rowTitle}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {appointment.clientName}
          </Text>
          <StatusBadge status={appointment.status} />
        </View>
        <Text variant="helper" color="textSecondary" numberOfLines={1}>
          {appointment.serviceName}
          {appointment.staffName ? ` · ${appointment.staffName}` : ''}
        </Text>
      </View>
      <View style={styles.rowTime}>
        <Text variant="small">{formatDate(appointment.startsAt, timeZone, locale, 'short')}</Text>
        <Text variant="caption" color="textSecondary">
          {formatTime(appointment.startsAt, timeZone, locale)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: theme.spacing[24],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    minHeight: theme.layout.minTouchTarget,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
  },
  rowBody: {
    flex: 1,
    gap: theme.spacing[2],
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
  },
  name: {
    flexShrink: 1,
  },
  rowTime: {
    alignItems: 'flex-end',
    gap: theme.spacing[2],
  },
  footer: {
    paddingVertical: theme.spacing[16],
    alignItems: 'center',
  },
});
