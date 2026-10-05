import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Skeleton, Text } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { formatDateTime, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useAppointmentMessages } from '../api/useAppointmentMessages';
import { channelKey, codeKey, eventKey, statusKey, statusTone } from '../messageLogic';

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
});
