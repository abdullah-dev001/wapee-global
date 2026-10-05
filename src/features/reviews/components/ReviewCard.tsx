import { MessageSquare, Star } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { StarRating } from '@/components/shared/StarRating';
import { Badge, Button, Card, Text } from '@/components/ui';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { type ReviewItem } from '../types';

export type ReviewCardProps = {
  review: ReviewItem;
  zone: string;
  canReply: boolean;
  canFeature: boolean;
  featureBusy: boolean;
  onReply: (review: ReviewItem) => void;
  onToggleFeatured: (review: ReviewItem) => void;
};

/** One review: stars, first name, comment, the owner's reply, and the owner actions. */
export function ReviewCard({
  review,
  zone,
  canReply,
  canFeature,
  featureBusy,
  onReply,
  onToggleFeatured,
}: ReviewCardProps) {
  const { t, i18n } = useTranslation();

  return (
    <Card>
      <View style={styles.body}>
        <View style={styles.header}>
          <StarRating
            rating={review.rating}
            accessibilityLabel={t('reviews.ratingLabel', { rating: review.rating })}
          />
          <View style={styles.badges}>
            {review.featuredOnWebsite ? (
              <Badge tone="primary">{t('reviews.featured')}</Badge>
            ) : null}
            {review.ownerReply ? <Badge tone="success">{t('reviews.replied')}</Badge> : null}
          </View>
        </View>

        <Text variant="caption" color="textSecondary">
          {t('reviews.byOn', {
            name: review.reviewerFirstName,
            date: formatDate(review.createdAt as UtcIso, zone, i18n.language, 'medium'),
          })}
        </Text>

        {review.comment ? (
          <Text variant="paragraph">{review.comment}</Text>
        ) : (
          <Text variant="small" color="textMuted">
            {t('reviews.noComment')}
          </Text>
        )}

        {review.ownerReply ? (
          <View style={styles.reply}>
            <Text variant="helper" color="textSecondary">
              {t('reviews.yourReply')}
            </Text>
            <Text variant="small">{review.ownerReply}</Text>
          </View>
        ) : null}

        {canReply || canFeature ? (
          <View style={styles.actions}>
            {canReply ? (
              <Button
                size="sm"
                variant="secondary"
                startIcon={MessageSquare}
                onPress={() => onReply(review)}
              >
                {review.ownerReply ? t('reviews.editReply') : t('reviews.reply')}
              </Button>
            ) : null}
            {canFeature ? (
              <Button
                size="sm"
                variant="ghost"
                startIcon={Star}
                loading={featureBusy}
                onPress={() => onToggleFeatured(review)}
              >
                {review.featuredOnWebsite ? t('reviews.unfeature') : t('reviews.feature')}
              </Button>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.spacing[10] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  badges: { flexDirection: 'row', gap: theme.spacing[6] },
  reply: {
    borderStartWidth: theme.borderWidth.thick,
    borderStartColor: theme.colors.primary,
    paddingStart: theme.spacing[12],
    gap: theme.spacing[2],
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
});
