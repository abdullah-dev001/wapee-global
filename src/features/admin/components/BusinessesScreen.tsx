import { useRouter } from 'expo-router';
import { Building2, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { usePagePadding } from '@/components/layout';
import { SearchInput } from '@/components/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  Text,
  type BadgeTone,
} from '@/components/ui';
import { statusKey } from '@/features/plans/featureLogic';
import { theme } from '@/lib/theme';

import { useAdminBusinesses, type AdminBusinessRow } from '../api/useAdmin';
import { AdminScreen } from './AdminScreen';
import { useAdminMessage } from './useAdminMessage';

const STATUS_TONE: Record<string, BadgeTone> = {
  trialing: 'info',
  active: 'success',
  inactive: 'warning',
  suspended: 'error',
};

const PLAN_FILTERS = ['all', 'solo', 'team', 'business'] as const;
const STATUS_FILTERS = ['all', 'trialing', 'active', 'inactive', 'suspended'] as const;

/** Businesses list: server-side search, plan/status filters, keyset pages of 20. */
export function BusinessesScreen() {
  const { t } = useTranslation();
  const messageOf = useAdminMessage();
  const padding = usePagePadding();
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<(typeof PLAN_FILTERS)[number]>('all');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('all');

  const filters = useMemo(
    () => ({ plan: plan === 'all' ? null : plan, status: status === 'all' ? null : status }),
    [plan, status],
  );
  const list = useAdminBusinesses(search, filters);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const filtered = search !== '' || plan !== 'all' || status !== 'all';

  const header = (
    <View style={styles.filters}>
      <SearchInput
        label={t('admin.businesses.search')}
        placeholder={t('admin.businesses.searchPlaceholder')}
        onSearch={setSearch}
      />
      <SegmentedControl
        label={t('admin.businesses.plan')}
        value={plan}
        onChange={setPlan}
        options={PLAN_FILTERS.map((value) => ({
          value,
          label: value === 'all' ? t('admin.businesses.all') : t(`plans.names.${value}`),
        }))}
      />
      <SegmentedControl
        label={t('admin.businesses.status')}
        value={status}
        onChange={setStatus}
        options={STATUS_FILTERS.map((value) => ({
          value,
          label: value === 'all' ? t('admin.businesses.all') : t(`plans.status.${value}`),
        }))}
      />
    </View>
  );

  return (
    <AdminScreen
      scroll={false}
      title={t('admin.businesses.title')}
      subtitle={t('admin.businesses.subtitle')}
    >
      {list.isError ? (
        <ErrorState
          title={messageOf(list.error)}
          onRetry={() => void list.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(row) => row.id}
          style={styles.list}
          contentContainerStyle={[styles.content, { paddingBottom: padding }]}
          ListHeaderComponent={header}
          renderItem={({ item }) => <BusinessRow row={item} />}
          ListEmptyComponent={
            list.isPending ? (
              <View style={styles.rows}>
                {[0, 1, 2, 3].map((n) => (
                  <Skeleton key={n} height={72} radius="lg" />
                ))}
              </View>
            ) : (
              <EmptyState
                compact
                icon={Building2}
                title={filtered ? t('admin.businesses.noResults') : t('admin.businesses.empty')}
                description={filtered ? t('admin.businesses.noResultsHint') : undefined}
              />
            )
          }
          ListFooterComponent={
            list.hasNextPage ? (
              <View style={styles.more}>
                <Button
                  variant="secondary"
                  loading={list.isFetchingNextPage}
                  onPress={() => void list.fetchNextPage()}
                >
                  {t('admin.businesses.loadMore')}
                </Button>
              </View>
            ) : null
          }
        />
      )}
    </AdminScreen>
  );
}

function BusinessRow({ row }: { row: AdminBusinessRow }) {
  const { t } = useTranslation();
  const router = useRouter();
  const planLabel = row.plan ? t(`plans.names.${planKey(row.plan)}`) : t('admin.businesses.noPlan');
  return (
    <Card onPress={() => router.push({ pathname: '/admin/business/[id]', params: { id: row.id } })}>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text variant="cardTitle" numberOfLines={1}>
            {row.name}
          </Text>
          <Text variant="helper" color="textSecondary" numberOfLines={1}>
            {`${row.slug} · ${planLabel} · ${t('admin.businesses.staffCount', { count: row.staffCount })} · ${t('admin.businesses.branchCount', { count: row.branchCount })}`}
          </Text>
        </View>
        <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
          {statusKey(row.status) ? t(statusKey(row.status) ?? 'plans.status.trialing') : row.status}
        </Badge>
        <ChevronRight
          size={theme.iconSize.md}
          strokeWidth={theme.iconStroke}
          color={theme.colors.textMuted}
        />
      </View>
    </Card>
  );
}

function planKey(plan: string): 'solo' | 'team' | 'business' {
  return plan === 'team' || plan === 'business' ? plan : 'solo';
}
const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { gap: theme.spacing[12] },
  filters: { gap: theme.spacing[12], paddingBottom: theme.spacing[4] },
  rows: { gap: theme.spacing[12] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    minHeight: theme.layout.minTouchTarget,
  },
  rowText: { flex: 1, gap: theme.spacing[2] },
  more: { alignItems: 'center', paddingVertical: theme.spacing[16] },
});
