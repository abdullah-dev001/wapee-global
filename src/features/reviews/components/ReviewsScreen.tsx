import { Star } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen, usePagePadding } from '@/components/layout';
import { Button, EmptyState, ErrorState, Select, Skeleton, Card, useToast } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { ReviewRpcError } from '../types';
import { useReviewList, useSetReviewFeatured } from '../api/useReviews';
import { filtersFromParams, isFiltered } from '../reviewLogic';
import { type ReviewItem } from '../types';
import { ReplyDrawer } from './ReplyDrawer';
import { ReviewCard } from './ReviewCard';

type Params = { rating?: string; replied?: string; featured?: string; branch?: string };

const ALL = 'all';

/**
 * Reviews: filterable, server-paginated (keyset). Branch-scope roles see their
 * branch; Staff see only reviews of their own appointments (RLS). Reply needs
 * `reviews.reply`, featuring needs `reviews.feature_on_website`.
 */
export function ReviewsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<Params>();
  const { businessId, business } = useCurrentScope();
  const canReply = usePermission('reviews.reply');
  const canFeature = usePermission('reviews.feature_on_website');
  const pagePadding = usePagePadding();

  const filters = filtersFromParams(params);
  const filtered = isFiltered(filters);
  const list = useReviewList(businessId, filters);
  const feature = useSetReviewFeatured(businessId);

  const [replying, setReplying] = useState<ReviewItem | null>(null);
  const [featuringId, setFeaturingId] = useState<string | null>(null);

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const branches = business?.branches ?? [];
  const zoneOf = (branchId: string) => branches.find((b) => b.id === branchId)?.timezone ?? 'UTC';

  const setParam = (key: keyof Params, value: string) =>
    router.setParams({ [key]: value === ALL ? undefined : value });

  const toggleFeatured = (review: ReviewItem) => {
    setFeaturingId(review.id);
    feature.mutate(
      { reviewId: review.id, featured: !review.featuredOnWebsite },
      {
        onSettled: () => setFeaturingId(null),
        onError: (error) =>
          toast.show({
            message:
              error instanceof ReviewRpcError && error.code === 'too_many_featured'
                ? t('reviews.errors.tooManyFeatured')
                : t('reviews.errors.feature'),
            tone: 'error',
          }),
      },
    );
  };

  const yesNo = (label: string) => [
    { value: ALL, label },
    { value: 'yes', label: t('reviews.filters.yes') },
    { value: 'no', label: t('reviews.filters.no') },
  ];

  return (
    <Screen edges={['top']} scroll={false}>
      <PageContainer title={t('reviews.title')} subtitle={t('reviews.subtitle')}>
        <View style={styles.filters}>
          <Select
            value={filters.rating ? String(filters.rating) : ALL}
            onChange={(v) => setParam('rating', v)}
            label={t('reviews.filters.rating')}
            title={t('reviews.filters.rating')}
            options={[
              { value: ALL, label: t('reviews.filters.allRatings') },
              ...[5, 4, 3, 2, 1].map((n) => ({
                value: String(n),
                label: t('reviews.filters.stars', { count: n }),
              })),
            ]}
          />
          <Select
            value={params.replied ?? ALL}
            onChange={(v) => setParam('replied', v)}
            label={t('reviews.filters.replied')}
            title={t('reviews.filters.replied')}
            options={yesNo(t('reviews.filters.anyReply'))}
          />
          <Select
            value={params.featured ?? ALL}
            onChange={(v) => setParam('featured', v)}
            label={t('reviews.filters.featured')}
            title={t('reviews.filters.featured')}
            options={yesNo(t('reviews.filters.anyFeatured'))}
          />
          {branches.length > 1 ? (
            <Select
              value={params.branch ?? ALL}
              onChange={(v) => setParam('branch', v)}
              label={t('reviews.filters.branch')}
              title={t('reviews.filters.branch')}
              options={[
                { value: ALL, label: t('reviews.filters.allBranches') },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          ) : null}
        </View>
      </PageContainer>

      <View style={[styles.body, { paddingHorizontal: pagePadding }]}>
        {list.isPending ? (
          <View style={styles.list}>
            {[0, 1, 2].map((n) => (
              <Card key={n}>
                <Skeleton width="30%" height={16} />
                <Skeleton height={14} style={styles.skeletonLine} />
                <Skeleton width="70%" height={14} />
              </Card>
            ))}
          </View>
        ) : list.isError ? (
          <ErrorState
            title={t('reviews.errors.loadTitle')}
            description={t('reviews.errors.loadMessage')}
            onRetry={() => void list.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Star}
            title={filtered ? t('reviews.emptyFilteredTitle') : t('reviews.emptyTitle')}
            description={filtered ? t('reviews.emptyFilteredMessage') : t('reviews.emptyMessage')}
            action={
              filtered
                ? {
                    children: t('reviews.clearFilters'),
                    variant: 'secondary',
                    onPress: () =>
                      router.setParams({
                        rating: undefined,
                        replied: undefined,
                        featured: undefined,
                      }),
                  }
                : undefined
            }
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(review) => review.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ReviewCard
                review={item}
                zone={zoneOf(item.branchId)}
                canReply={canReply.allowed}
                canFeature={canFeature.allowed}
                featureBusy={featuringId === item.id}
                onReply={setReplying}
                onToggleFeatured={toggleFeatured}
              />
            )}
            ListFooterComponent={
              list.hasNextPage ? (
                <View style={styles.more}>
                  <Button
                    variant="secondary"
                    loading={list.isFetchingNextPage}
                    onPress={() => void list.fetchNextPage()}
                  >
                    {t('reviews.loadMore')}
                  </Button>
                </View>
              ) : null
            }
          />
        )}
      </View>

      <ReplyDrawer businessId={businessId} review={replying} onClose={() => setReplying(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    marginTop: theme.spacing[8],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
  body: { flex: 1, marginTop: theme.spacing[12] },
  list: { gap: theme.spacing[12], paddingBottom: theme.spacing[32] },
  skeletonLine: { marginVertical: theme.spacing[8] },
  more: { alignItems: 'center', paddingVertical: theme.spacing[16] },
});
