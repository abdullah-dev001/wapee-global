import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Drawer, Input, useToast } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useReplyToReview } from '../api/useReviews';
import { MAX_REPLY_LENGTH, cleanReply } from '../reviewLogic';
import { type ReviewItem } from '../types';

/** Write or edit the public reply to a review. It is shown on the website next to a featured review. */
export function ReplyDrawer({
  businessId,
  review,
  onClose,
}: {
  businessId: string | null;
  review: ReviewItem | null;
  onClose: () => void;
}) {
  return (
    <ReplyDrawerBody
      key={review?.id ?? 'none'}
      businessId={businessId}
      review={review}
      onClose={onClose}
    />
  );
}

function ReplyDrawerBody({
  businessId,
  review,
  onClose,
}: {
  businessId: string | null;
  review: ReviewItem | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const reply = useReplyToReview(businessId);
  const [text, setText] = useState(review?.ownerReply ?? '');
  const cleaned = cleanReply(text);

  const submit = () => {
    if (!review || !cleaned) return;
    reply.mutate(
      { reviewId: review.id, reply: cleaned },
      {
        onSuccess: () => {
          toast.show({ message: t('reviews.replySaved'), tone: 'success' });
          onClose();
        },
        onError: () => toast.show({ message: t('reviews.errors.reply'), tone: 'error' }),
      },
    );
  };

  return (
    <Drawer
      open={review !== null}
      onClose={onClose}
      title={t('reviews.replyTitle')}
      subtitle={review ? t('reviews.replySubtitle', { name: review.reviewerFirstName }) : undefined}
      footer={
        <View style={styles.footer}>
          <Button variant="ghost" onPress={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button loading={reply.isPending} disabled={!cleaned} onPress={submit}>
            {t('actions.save')}
          </Button>
        </View>
      }
    >
      <Input
        label={t('reviews.replyLabel')}
        hint={t('reviews.replyHint')}
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={5}
        maxLength={MAX_REPLY_LENGTH}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing[8] },
});
