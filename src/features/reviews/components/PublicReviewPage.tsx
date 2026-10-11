import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, LinkIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { LegalLinks } from '@/components/shared/LegalLinks';
import { StarRatingInput } from '@/components/shared/StarRating';
import { Button, Card, EmptyState, ErrorState, Input, Skeleton, Text } from '@/components/ui';
import { HoneypotField } from '@/features/booking-public/components/HoneypotField';
import { useTokenFromUrl } from '@/features/booking-manage/useTokenFromUrl';
import { PublicApiError } from '@/features/booking-public/types';
import { theme, useBreakpoint } from '@/lib/theme';

import { usePublicReviewRequest, useSubmitReview } from '../api/usePublicReview';
import { cleanComment, MAX_COMMENT_LENGTH } from '../reviewLogic';
import { reviewFormSchema, type ReviewFormValues } from '../schemas/reviewForm.schema';

const MAX_WIDTH = 480;

/**
 * The customer's review page (`(public)/[slug]/review#token=...`).
 *
 * Deliberately has NO "which staff member" prompt (doc §6.4) and no incentive
 * wording. After submitting, EVERY customer sees the same thank-you, and the same
 * Google review link when the branch has one, whatever star rating they gave.
 */
export function PublicReviewPage() {
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const token = useTokenFromUrl();
  const request = usePublicReviewRequest(token ?? null);
  const submit = useSubmitReview();

  const [honeypot, setHoneypot] = useState('');
  const [done, setDone] = useState<{ googleReviewUrl: string | null } | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [failed, setFailed] = useState(false);
  const [invalidated, setInvalidated] = useState(false);

  const { control, handleSubmit, formState } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: { rating: 0, comment: '' },
  });

  const wrap = (children: React.ReactNode) => (
    <Screen>
      <PageContainer maxWidth={isDesktop ? MAX_WIDTH : undefined}>
        {children}
        <LegalLinks />
      </PageContainer>
    </Screen>
  );

  // Still reading the URL (native resolves it asynchronously).
  if (token === undefined || (token && request.isPending)) {
    return wrap(
      <View style={styles.stack} accessibilityElementsHidden>
        <Skeleton height={28} width="60%" />
        <Skeleton height={140} radius="lg" />
      </View>,
    );
  }

  const code = (request.error as { code?: string } | null)?.code;
  const isInvalid = !token || invalidated || code === 'invalid_token' || code === 'bad_request';
  if (isInvalid) {
    // ONE page for unknown, expired, used and withdrawn links: no hints.
    return wrap(
      <EmptyState
        icon={LinkIcon}
        title={t('reviewPage.invalidTitle')}
        description={t('reviewPage.invalidMessage')}
      />,
    );
  }

  if (request.isError) {
    return wrap(
      <ErrorState
        title={t('reviewPage.loadErrorTitle')}
        description={t('reviewPage.loadErrorMessage')}
        onRetry={() => void request.refetch()}
        retryLabel={t('actions.retry')}
      />,
    );
  }

  if (done) {
    return wrap(
      <Card>
        <View style={styles.thanks}>
          <CheckCircle2
            size={theme.iconSize.xl * 2}
            strokeWidth={theme.iconStroke}
            color={theme.colors.success}
          />
          <Text variant="pageTitleMobile" align="center">
            {t('reviewPage.thanksTitle')}
          </Text>
          <Text variant="paragraph" color="textSecondary" align="center">
            {t('reviewPage.thanksMessage')}
          </Text>
          {done.googleReviewUrl ? (
            <View style={styles.google}>
              <Text variant="small" color="textSecondary" align="center">
                {t('reviewPage.googlePrompt')}
              </Text>
              <Button
                variant="secondary"
                onPress={() => void Linking.openURL(done.googleReviewUrl ?? '')}
              >
                {t('reviewPage.googleButton')}
              </Button>
            </View>
          ) : null}
        </View>
      </Card>,
    );
  }

  const info = request.data;
  const onSubmit = handleSubmit(async (values) => {
    setRateLimited(false);
    setFailed(false);
    const comment = cleanComment(values.comment);
    if (!comment.ok || !token) return;
    try {
      const result = await submit.mutateAsync({
        token,
        rating: values.rating,
        comment: comment.value,
        honeypot,
      });
      setDone(result);
    } catch (error) {
      const failureCode = error instanceof PublicApiError ? error.code : null;
      if (failureCode === 'invalid_token') setInvalidated(true);
      else if (failureCode === 'rate_limited') setRateLimited(true);
      else setFailed(true);
    }
  });

  return wrap(
    <Card>
      <View style={styles.stack}>
        <View style={styles.header}>
          <Text variant="pageTitleMobile">{t('reviewPage.title')}</Text>
          <Text variant="small" color="textSecondary">
            {t('reviewPage.subtitle', {
              business: info?.businessName ?? '',
              service: info?.serviceName ?? '',
            })}
          </Text>
        </View>

        <Controller
          control={control}
          name="rating"
          render={({ field }) => (
            <View style={styles.rating}>
              <Text variant="label" align="center">
                {t('reviewPage.ratingLabel')}
              </Text>
              <StarRatingInput
                value={field.value}
                onChange={field.onChange}
                labelFor={(n) => t('reviewPage.starLabel', { count: n })}
                disabled={formState.isSubmitting}
              />
              {formState.errors.rating ? (
                <Text variant="helper" color="error" align="center">
                  {t('reviewPage.errors.ratingRequired')}
                </Text>
              ) : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="comment"
          render={({ field }) => (
            <Input
              label={t('reviewPage.commentLabel')}
              hint={t('reviewPage.commentHint', { max: MAX_COMMENT_LENGTH })}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              multiline
              numberOfLines={5}
              maxLength={MAX_COMMENT_LENGTH}
              error={formState.errors.comment ? t('reviewPage.errors.commentTooLong') : undefined}
            />
          )}
        />

        <HoneypotField value={honeypot} onChange={setHoneypot} />

        {rateLimited ? (
          <Text variant="helper" color="error">
            {t('reviewPage.errors.rateLimited')}
          </Text>
        ) : null}
        {failed ? (
          <Text variant="helper" color="error">
            {t('reviewPage.errors.failed')}
          </Text>
        ) : null}

        <Button fullWidth loading={formState.isSubmitting} onPress={() => void onSubmit()}>
          {t('reviewPage.submit')}
        </Button>
      </View>
    </Card>,
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[16] },
  header: { gap: theme.spacing[4] },
  rating: { gap: theme.spacing[8] },
  thanks: { alignItems: 'center', gap: theme.spacing[12], paddingVertical: theme.spacing[16] },
  google: { alignItems: 'center', gap: theme.spacing[8], marginTop: theme.spacing[8] },
});
