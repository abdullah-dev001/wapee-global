import type { ParseKeys } from 'i18next';
import { launch } from '@/config/launch';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, ErrorState, SegmentedControl, Select, Skeleton, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { useMessagePreview } from '../api/useMessagePreview';
import {
  CLIENT_EVENTS,
  encodingKey,
  eventKey,
  formatCredits,
  type ClientEvent,
} from '../messageLogic';

type Props = { businessId: string | null; branchId: string | null };

/**
 * What a customer will receive, rendered by the SAME templates the worker uses
 * (Edge Function `message_preview`). For SMS it also shows how many segments the
 * message is and what that costs, because a long link or one non-Latin character
 * can double the price.
 */
export function MessagePreviewCard({ businessId, branchId }: Props) {
  const { t, i18n } = useTranslation();
  const [event, setEvent] = useState<ClientEvent>('booking_confirmed');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const preview = useMessagePreview({ businessId, branchId, event, channel });

  return (
    <Card>
      <View style={styles.stack}>
        <View>
          <Text variant="cardTitle">{t('notifications.preview.title')}</Text>
          <Text variant="helper" color="textSecondary">
            {t('notifications.preview.hint')}
          </Text>
        </View>

        <Select<ClientEvent>
          label={t('notifications.preview.message')}
          title={t('notifications.preview.message')}
          value={event}
          onChange={setEvent}
          options={CLIENT_EVENTS.map((value) => ({ value, label: t(eventKey(value)) }))}
        />
        <SegmentedControl
          label={t('notifications.preview.channel')}
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'email', label: t('notifications.preview.email') },
            ...(launch.sms
              ? [{ value: 'sms' as const, label: t('notifications.preview.sms') }]
              : []),
          ]}
        />

        {preview.isPending ? (
          <View style={styles.stack}>
            <Skeleton height={16} width="60%" />
            <Skeleton height={14} />
            <Skeleton height={14} width="80%" />
          </View>
        ) : preview.isError ? (
          <ErrorState
            compact
            title={t('notifications.preview.error')}
            onRetry={() => void preview.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : (
          <View style={styles.stack}>
            <View style={styles.sample}>
              {preview.data.subject ? (
                <Text variant="label" color="textPrimary">
                  {t('notifications.preview.subject')}: {preview.data.subject}
                </Text>
              ) : null}
              <Text variant="small" color="textPrimary">
                {preview.data.text}
              </Text>
            </View>

            {channel === 'sms' ? (
              <View style={styles.cost}>
                <Text variant="caption" color="textPrimary">
                  {preview.data.credits !== null
                    ? t('notifications.preview.cost', {
                        count: preview.data.segments,
                        credits: formatCredits(preview.data.credits, i18n.language),
                      })
                    : t('notifications.preview.segmentsOnly', { count: preview.data.segments })}
                </Text>
                {encodingKey(preview.data.encoding) ? (
                  <Text variant="helper" color="textSecondary">
                    {t(encodingKey(preview.data.encoding) as ParseKeys)}
                  </Text>
                ) : null}
                {preview.data.rateAvailable === false ? (
                  <Text variant="helper" color="warning">
                    {t('notifications.preview.noRate', {
                      country: preview.data.countryCode ?? '',
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  sample: {
    gap: theme.spacing[8],
    padding: theme.spacing[12],
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  cost: { gap: theme.spacing[4] },
});
