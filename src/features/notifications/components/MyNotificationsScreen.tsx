import type { ParseKeys } from 'i18next';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Card, ErrorState, Skeleton, Text, Toggle, useToast } from '@/components/ui';
import { PushError } from '@/lib/push';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import {
  usePushDevice,
  usePushDeviceActions,
  usePushPreferences,
  useSavePushPreferences,
  type PushPreferences,
} from '../api/usePush';

const PREFS: { key: keyof PushPreferences; label: ParseKeys }[] = [
  { key: 'newBooking', label: 'notifications.push.newBooking' },
  { key: 'pendingApproval', label: 'notifications.push.pendingApproval' },
  { key: 'cancelled', label: 'notifications.push.cancelled' },
  { key: 'reminder', label: 'notifications.push.reminder' },
];

/**
 * Push alerts for THIS device (every member, Staff included: it is their own
 * device). Nothing is asked on load: the system permission prompt appears only
 * when the "Enable notifications" button is tapped. Not testable on web or a
 * simulator without push: it needs a real device and an EAS build.
 */
export function MyNotificationsScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const device = usePushDevice();
  const { enable, disable } = usePushDeviceActions();
  const prefs = usePushPreferences(businessId);
  const savePrefs = useSavePushPreferences(businessId);

  const onEnable = () =>
    enable.mutate(undefined, {
      onSuccess: () => toast.show({ message: t('notifications.push.enabled'), tone: 'success' }),
      onError: (error) =>
        // A refusal is shown by the "blocked" state itself; only real failures toast.
        error instanceof PushError && error.reason === 'blocked'
          ? undefined
          : toast.show({ message: t('notifications.push.enableError'), tone: 'error' }),
    });

  const onDisable = () =>
    disable.mutate(undefined, {
      onSuccess: () => toast.show({ message: t('notifications.push.disabled'), tone: 'success' }),
      onError: () => toast.show({ message: t('notifications.push.disableError'), tone: 'error' }),
    });

  const status = device.data?.status;

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('notifications.hub.myTitle')}
        subtitle={t('notifications.push.subtitle')}
      >
        <View style={styles.stack}>
          <Card>
            <View style={styles.stack}>
              <Text variant="cardTitle">{t('notifications.push.title')}</Text>
              {device.isPending ? (
                <Skeleton height={44} />
              ) : device.isError ? (
                <ErrorState
                  compact
                  title={t('notifications.push.loadError')}
                  onRetry={() => void device.refetch()}
                  retryLabel={t('actions.retry')}
                />
              ) : status === 'unsupported' ? (
                <Text variant="small" color="textSecondary">
                  {t('notifications.push.unsupported')}
                </Text>
              ) : status === 'not_configured' ? (
                <Text variant="small" color="textSecondary">
                  {t('notifications.push.notConfigured')}
                </Text>
              ) : status === 'blocked' ? (
                <Text variant="small" color="warning">
                  {t('notifications.push.blocked')}
                </Text>
              ) : status === 'on' ? (
                <View style={styles.stack}>
                  <Text variant="small" color="success">
                    {t('notifications.push.on')}
                  </Text>
                  <Button variant="secondary" loading={disable.isPending} onPress={onDisable}>
                    {t('notifications.push.disable')}
                  </Button>
                </View>
              ) : (
                <View style={styles.stack}>
                  <Text variant="small" color="textSecondary">
                    {t('notifications.push.off')}
                  </Text>
                  <Button loading={enable.isPending} onPress={onEnable}>
                    {t('notifications.push.enable')}
                  </Button>
                </View>
              )}
            </View>
          </Card>

          {status === 'on' ? (
            <Card>
              <View style={styles.stack}>
                <Text variant="cardTitle">{t('notifications.push.prefsTitle')}</Text>
                {prefs.isPending ? (
                  <Skeleton height={44} />
                ) : (
                  PREFS.map(({ key, label }) => (
                    <Toggle
                      key={key}
                      label={t(label)}
                      value={prefs.data?.[key] ?? true}
                      disabled={savePrefs.isPending}
                      onValueChange={(value) =>
                        savePrefs.mutate(
                          { [key]: value },
                          {
                            onError: () =>
                              toast.show({
                                message: t('notifications.push.prefsError'),
                                tone: 'error',
                              }),
                          },
                        )
                      }
                    />
                  ))
                )}
              </View>
            </Card>
          ) : null}
        </View>
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: theme.spacing[16] } });
