import { Users } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Avatar, DataTable, type DataTableColumn } from '@/components/shared';
import { Badge, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { usePermission } from '@/lib/permissions';
import { focusRing, theme, useBreakpoint } from '@/lib/theme';

import { useClients, type ClientListFilters, type ClientListItem } from '../api/useClients';

export type ClientListViewProps = {
  businessId: string | null;
  filters: ClientListFilters;
  onSelect: (client: ClientListItem) => void;
};

/**
 * Same hook, same query, different render per breakpoint (CLAUDE.md §5):
 * mobile renders cards, desktop/tablet renders `DataTable`.
 */
export function ClientListView({ businessId, filters, onSelect }: ClientListViewProps) {
  const { t } = useTranslation();
  const { isMobile, isCompact } = useBreakpoint();
  const canViewContact = usePermission('clients.view_contact').allowed;
  const query = useClients(businessId, filters, canViewContact);

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.rows) ?? [], [query.data]);

  if (query.isError) {
    return (
      <ErrorState
        title={t('clients.error.title')}
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
          <View key={row} style={styles.skeletonRow}>
            <Skeleton height={28} width={28} radius="full" />
            <Skeleton height={16} width="50%" radius="sm" />
          </View>
        ))}
      </Card>
    );
  }

  if (rows.length === 0) {
    const isFiltered = Boolean(filters.search);
    return (
      <EmptyState
        icon={Users}
        title={isFiltered ? t('clients.emptySearch.title') : t('clients.empty.title')}
        description={
          isFiltered ? t('clients.emptySearch.description') : t('clients.empty.description')
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
          <ClientCard
            client={item}
            canViewContact={canViewContact}
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

  const columns: DataTableColumn<ClientListItem>[] = [
    {
      key: 'name',
      label: t('clients.fullName'),
      render: (client) => client.fullName,
    },
    ...(canViewContact
      ? [
          {
            key: 'phone',
            label: t('clients.phone'),
            hideOnCompact: true,
            render: (client: ClientListItem) => client.phoneE164,
          },
          {
            key: 'email',
            label: t('clients.email'),
            hideOnCompact: true,
            render: (client: ClientListItem) => client.email ?? '—',
          },
        ]
      : []),
    {
      key: 'status',
      label: '',
      render: (client) =>
        client.isArchived ? <Badge tone="neutral">{t('clients.archived')}</Badge> : '',
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      onRowPress={onSelect}
      isCompact={isCompact}
      isRefetching={query.isRefetching}
    />
  );
}

function ClientCard({
  client,
  canViewContact,
  onPress,
}: {
  client: ClientListItem;
  canViewContact: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.card, showHover ? { opacity: 0.8 } : null, showFocusRing ? focusRing() : null]}
    >
      <Avatar name={client.fullName} />
      <View style={styles.cardBody}>
        <View style={styles.cardTitle}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.cardName}>
            {client.fullName}
          </Text>
          {client.isArchived ? <Badge tone="neutral">{t('clients.archived')}</Badge> : null}
        </View>
        {canViewContact ? (
          <Text variant="helper" color="textSecondary" numberOfLines={1}>
            {client.phoneE164}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: theme.spacing[24],
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
    padding: theme.spacing[16],
  },
  card: {
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
  cardBody: {
    flex: 1,
    gap: theme.spacing[2],
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
  },
  cardName: {
    flexShrink: 1,
  },
});
