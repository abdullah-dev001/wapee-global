import { Receipt } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { DataTable, type DataTableColumn } from '@/components/shared';
import { Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { useCurrentScope } from '@/lib/permissions';
import { focusRing, theme, useBreakpoint } from '@/lib/theme';

import { useInvoiceList, type InvoiceListFilters } from '../api/useInvoices';
import { formatInvoiceDate, formatMinor } from '../format';
import { type InvoiceListRow } from '../types';
import { InvoiceStateBadge } from './InvoiceStateBadge';
import { invoiceErrorKey } from '../invoiceErrorKey';

export type InvoiceListViewProps = {
  businessId: string | null;
  filters: InvoiceListFilters;
  isFiltered: boolean;
  onSelect: (invoice: InvoiceListRow) => void;
};

/** Same query, different render per breakpoint (CLAUDE.md §5): mobile cards, desktop/tablet `DataTable`. */
export function InvoiceListView({
  businessId,
  filters,
  isFiltered,
  onSelect,
}: InvoiceListViewProps) {
  const { t, i18n } = useTranslation();
  const { isMobile, isCompact } = useBreakpoint();
  const { business } = useCurrentScope();
  const query = useInvoiceList(businessId, filters);

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.rows) ?? [], [query.data]);
  const zoneOf = (branchId: string) =>
    business?.branches.find((branch) => branch.id === branchId)?.timezone ?? 'UTC';
  const dateOf = (row: InvoiceListRow) =>
    formatInvoiceDate(row.issuedAt ?? row.createdAt, zoneOf(row.branchId), i18n.language);
  const numberOf = (row: InvoiceListRow) => row.number ?? t('invoices.noNumber');
  const clientOf = (row: InvoiceListRow) => row.clientName ?? t('invoices.walkInClient');

  if (query.isError) {
    return (
      <ErrorState
        title={t('invoices.error.title')}
        description={t(invoiceErrorKey(query.error))}
        onRetry={() => void query.refetch()}
        retryLabel={t('actions.retry')}
      />
    );
  }

  if (query.isPending) {
    return (
      <Card noPadding>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <View style={styles.skeletonText}>
              <Skeleton height={16} width="40%" radius="sm" />
              <Skeleton height={12} width="60%" radius="sm" />
            </View>
            <Skeleton height={16} width={64} radius="sm" />
          </View>
        ))}
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={isFiltered ? t('invoices.emptySearch.title') : t('invoices.empty.title')}
        description={
          isFiltered ? t('invoices.emptySearch.description') : t('invoices.empty.description')
        }
      />
    );
  }

  if (isMobile) {
    return (
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InvoiceCard
            title={numberOf(item)}
            client={clientOf(item)}
            date={dateOf(item)}
            total={formatMinor(item.totalMinor, item.currency, i18n.language)}
            balance={
              item.status === 'issued' && item.balanceMinor > 0
                ? t('invoices.detail.balance') +
                  ' ' +
                  formatMinor(item.balanceMinor, item.currency, i18n.language)
                : null
            }
            row={item}
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
        contentContainerStyle={styles.listContent}
      />
    );
  }

  const columns: DataTableColumn<InvoiceListRow>[] = [
    { key: 'number', label: t('invoices.columns.number'), render: (row) => numberOf(row) },
    { key: 'client', label: t('invoices.columns.client'), render: (row) => clientOf(row) },
    {
      key: 'date',
      label: t('invoices.columns.date'),
      hideOnCompact: true,
      render: (row) => dateOf(row),
    },
    {
      key: 'total',
      label: t('invoices.columns.total'),
      render: (row) => formatMinor(row.totalMinor, row.currency, i18n.language),
    },
    {
      key: 'balance',
      label: t('invoices.columns.balance'),
      hideOnCompact: true,
      render: (row) =>
        row.status === 'issued' ? formatMinor(row.balanceMinor, row.currency, i18n.language) : '—',
    },
    {
      key: 'state',
      label: t('invoices.columns.state'),
      render: (row) => <InvoiceStateBadge status={row.status} paymentStatus={row.paymentStatus} />,
    },
  ];

  return (
    <View style={styles.tableWrap}>
      <DataTable
        columns={columns}
        rows={rows}
        onRowPress={onSelect}
        isCompact={isCompact}
        isRefetching={query.isRefetching}
      />
      {query.hasNextPage ? (
        <Pressable
          onPress={() => void query.fetchNextPage()}
          accessibilityRole="button"
          style={styles.loadMore}
        >
          <Text variant="label" color="primary">
            {query.isFetchingNextPage ? '…' : t('invoices.loadMore')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InvoiceCard({
  title,
  client,
  date,
  total,
  balance,
  row,
  onPress,
}: {
  title: string;
  client: string;
  date: string;
  total: string;
  balance: string | null;
  row: InvoiceListRow;
  onPress: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.card, showHover ? { opacity: 0.8 } : null, showFocusRing ? focusRing() : null]}
    >
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.cardTitle}>
            {title}
          </Text>
          <Text variant="bodyStrong">{total}</Text>
        </View>
        <Text variant="helper" color="textSecondary" numberOfLines={1}>
          {client} · {date}
        </Text>
        <View style={styles.cardBottom}>
          <InvoiceStateBadge status={row.status} paymentStatus={row.paymentStatus} />
          {balance ? (
            <Text variant="caption" color="textSecondary">
              {balance}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: theme.spacing[24] },
  tableWrap: { gap: theme.spacing[8] },
  loadMore: {
    alignSelf: 'center',
    minHeight: theme.layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[16],
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
    padding: theme.spacing[16],
  },
  skeletonText: { flex: 1, gap: theme.spacing[6] },
  card: {
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    minHeight: theme.layout.minTouchTarget,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
  },
  cardBody: { gap: theme.spacing[4] },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  cardTitle: { flexShrink: 1 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
    marginTop: theme.spacing[4],
  },
});
