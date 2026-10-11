import type { ParseKeys } from 'i18next';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Skeleton, Text, useToast } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { formatDateTime, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useAppointmentMessages, useRetryMessage } from '../api/useAppointmentMessages';
import { channelKey, codeKey, eventKey, failureHintKey, statusKey, statusTone } from '../messageLogic';

type Props = { appointmentId: string; timezone: string; enabled: boolean };

/**
 * "Did the customer get a message?" on the appointment detail. Event, channel and
 * status only (the RPC never returns an address). Renders nothing when the caller
 * may not see it (Staff at Own scope) or when the loading fails quietly.
 */
export function AppointmentMessages({ appointmentId, timezone, enabled }: Props) {
  const { t, i18n } = useTranslation();
  const { businessId } = useCurrentScope();
  const query = useAppointmentMessages(businessId, appointmentId, enabled);
  const canEdit = usePermission('appointments.edit');
  const retry = useRetryMessage(businessId);
  const toast = useToast();

  if (!enabled || query.data === null) return null;

  return (
    <View style={styles.section}>
      <Text variant="label" color="textSecondary">
        {t('notifications.appointment.title')}
      </Text>
      {query.isPending ? (
        <Skeleton height={20} />
      ) : query.isError ? (
        <Text variant="helper" color="textSecondary">
          {t('notifications.appointment.loadError')}
        </Text>
      ) : query.data.length === 0 ? (
        <Text variant="helper" color="textSecondary">
          {t('notifications.appointment.empty')}
        </Text>
      ) : (
        query.data.map((m, index) => {
          const code = codeKey(m.code);
          return (
            <View key={`${m.event}-${m.at}-${index}`} style={styles.row}>
              <View style={styles.text}>
                <Text variant="body">{t(eventKey(m.event))}</Text>
                <Text variant="helper" color="textSecondary">
                  {t(channelKey(m.channel))} ·{' '}
                  {formatDateTime(m.at as UtcIso, timezone, i18n.language, 'medium')}
                </Text>
                {code ? (
                  <Text variant="helper" color={m.status === 'failed' ? 'error' : 'warning'}>
                    {t(code)}
                  </Text>
                ) : null}
                {m.status === 'failed' && failureHintKey(m.error) ? (
                  <Text variant="helper" color="textSecondary">
                    {t(failureHintKey(m.error) as ParseKeys)}
                  </Text>
                ) : null}
                {m.canRetry && m.outboxId && canEdit.allowed ? (
                  <View style={styles.retry}>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={retry.isPending}
                      onPress={() => {
                        retry.mutate(m.outboxId as string, {
                          onSuccess: () =>
                            toast.show({ message: t('notifications.retry.queued'), tone: 'success' }),
                          onError: () =>
                            toast.show({ message: t('notifications.retry.failed'), tone: 'error' }),
                        });
                      }}
                    >
                      {t('notifications.retry.action')}
                    </Button>
                  </View>
                ) : null}
              </View>
              <Badge tone={statusTone(m.status)} dot>
                {t(statusKey(m.status))}
              </Badge>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing[8] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing[12],
  },
  text: { flex: 1, gap: theme.spacing[2] },
  retry: { alignItems: 'flex-start', marginTop: theme.spacing[4] },
});
