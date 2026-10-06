import { MessageSquareOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { StarRating } from '@/components/shared';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { useAdminReviews, type AdminReview } from '../api/useAdmin';
import { RemoveReviewDialog } from './AdminActionDialogs';
import { useAdminMessage } from './useAdminMessage';

/**
 * A business's reviews for the takedown flow. Loaded only when the admin opens the
 * section (the first page is an audited read). Removing needs a reason.
 */
export function AdminReviewsSection({ businessId }: { businessId: string }) {
  const { t, i18n } = useTranslation();
  const messageOf = useAdminMessage();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const reviews = useAdminReviews(businessId, open);
  const items = useMemo(() => reviews.data?.pages.flatMap((p) => p.items) ?? [], [reviews.data]);

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="sectionTitle">{t('admin.reviews.title')}</Text>
        {!open ? (
          <>
            <Text variant="helper" color="textSecondary">
              {t('admin.reviews.audited')}
            </Text>
            <View style={styles.start}>
              <Button variant="secondary" onPress={() => setOpen(true)}>
                {t('admin.reviews.load')}
              </Button>
            </View>
          </>
        ) : reviews.isError ? (
          <ErrorState
            compact
            title={messageOf(reviews.error)}
            onRetry={() => void reviews.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : reviews.isPending ? (
          <Skeleton height={72} radius="lg" />
        ) : items.length === 0 ? (
          <EmptyState compact icon={MessageSquareOff} title={t('admin.reviews.empty')} />
        ) : (
          <>
            {items.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                locale={i18n.language}
                onRemove={() => setTarget(review.id)}
              />
            ))}
            {reviews.hasNextPage ? (
              <View style={styles.start}>
                <Button
                  variant="secondary"
                  loading={reviews.isFetchingNextPage}
                  onPress={() => void reviews.fetchNextPage()}
                >
                  {t('admin.businesses.loadMore')}
                </Button>
              </View>
            ) : null}
          </>
        )}
      </View>
      <RemoveReviewDialog
        businessId={businessId}
        reviewId={target}
        open={target !== null}
        onClose={() => setTarget(null)}
      />
    </Card>
  );
}

function ReviewRow({
  review,
  locale,
  onRemove,
}: {
  review: AdminReview;
  locale: string;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const removed = review.status === 'removed';
  return (
    <View style={styles.review}>
      <View style={styles.reviewTop}>
        <StarRating rating={review.rating} />
        <Text variant="helper" color="textSecondary">
          {`${review.firstName} · ${formatDate(review.createdAt as UtcIso, 'UTC', locale, 'medium')}`}
        </Text>
        {removed ? <Badge tone="error">{t('admin.reviews.removed')}</Badge> : null}
      </View>
      {review.comment ? <Text variant="body">{review.comment}</Text> : null}
      {removed ? null : (
        <View style={styles.start}>
          <Button size="sm" variant="danger" onPress={onRemove}>
            {t('admin.reviews.remove')}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  start: { alignItems: 'flex-start' },
  review: {
    gap: theme.spacing[6],
    paddingTop: theme.spacing[12],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
});
