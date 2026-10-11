import { StyleSheet, View } from 'react-native';

import { StarRating } from '@/components/shared/StarRating';
import { Card } from '@/components/ui';
import { theme, useBreakpoint } from '@/lib/theme';

import { type WebsiteReviewItem } from '../../types';
import { SectionShell } from './SectionShell';
import { WText } from './WText';
import { useWebsiteTheme } from './WebsiteThemeContext';

export type TestimonialsSectionProps = {
  title: string;
  reviews: WebsiteReviewItem[];
  /** "{{name}} replied" style label for the owner's reply. */
  replyLabel: string;
  ratingLabel: (rating: number) => string;
};

/** Featured reviews: first name, stars, comment and the owner's reply. Nothing else about the customer. */
export function TestimonialsSection({
  title,
  reviews,
  replyLabel,
  ratingLabel,
}: TestimonialsSectionProps) {
  const { theme: site } = useWebsiteTheme();
  const { isMobile } = useBreakpoint();

  return (
    <SectionShell title={title} tinted>
      <View style={styles.grid}>
        {reviews.map((review, index) => (
          <View
            key={`${review.firstName}-${index}`}
            style={isMobile ? styles.cellFull : styles.cellHalf}
          >
            <Card style={{ borderRadius: site.cardRadius }}>
              <View style={styles.body}>
                <StarRating
                  rating={review.rating}
                  color={site.accentText}
                  accessibilityLabel={ratingLabel(review.rating)}
                />
                {review.comment ? <WText variant="paragraph">{review.comment}</WText> : null}
                <WText variant="caption" color="textSecondary">
                  {review.firstName}
                </WText>
                {review.ownerReply ? (
                  <View style={[styles.reply, { borderStartColor: site.accentText }]}>
                    <WText variant="helper" color="textSecondary">
                      {replyLabel}
                    </WText>
                    <WText variant="small">{review.ownerReply}</WText>
                  </View>
                ) : null}
              </View>
            </Card>
          </View>
        ))}
      </View>
    </SectionShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -theme.spacing[8] },
  cellFull: { width: '100%', padding: theme.spacing[8] },
  cellHalf: { width: '50%', padding: theme.spacing[8] },
  body: { gap: theme.spacing[10] },
  reply: {
    borderStartWidth: theme.borderWidth.thick,
    paddingStart: theme.spacing[12],
    gap: theme.spacing[2],
  },
});
