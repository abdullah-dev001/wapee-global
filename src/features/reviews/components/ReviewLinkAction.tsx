import { Link2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Text, useToast } from '@/components/ui';
import { usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { useAppointmentHasReview, useReissueReviewLink } from '../api/useReviews';
import { canOfferReviewLink } from '../reviewLogic';
import { showReviewLink } from '../reviewLinkStore';

/**
 * On a COMPLETED appointment: "Get review link again" (rotates the link, so the
 * previous one stops working) until the customer has reviewed. Needs the same
 * permission as completing the visit (`appointments.edit`).
 */
export function ReviewLinkAction({
  businessId,
  appointmentId,
  status,
}: {
  businessId: string | null;
  appointmentId: string;
  status: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const canEdit = usePermission('appointments.edit');
  const completed = status === 'completed';
  const review = useAppointmentHasReview(businessId, appointmentId, completed);
  const reissue = useReissueReviewLink(businessId);

  if (!completed) return null;

  const hasReview = review.data === true;
  if (hasReview) {
    return (
      <Text variant="small" color="textSecondary">
        {t('reviews.link.received')}
      </Text>
    );
  }

  if (!canOfferReviewLink({ status, hasReview, allowed: canEdit.allowed })) {
    return null;
  }

  return (
    <View style={{ gap: theme.spacing[4] }}>
      <Button
        variant="secondary"
        startIcon={Link2}
        loading={reissue.isPending}
        onPress={() =>
          reissue.mutate(
            { appointmentId },
            {
              onSuccess: (result) =>
                showReviewLink({ token: result.token, expires_at: result.expiresAt }),
              onError: () => toast.show({ message: t('reviews.link.error'), tone: 'error' }),
            },
          )
        }
      >
        {t('reviews.link.getAgain')}
      </Button>
      <Text variant="helper" color="textSecondary">
        {t('reviews.link.getAgainHint')}
      </Text>
    </View>
  );
}
