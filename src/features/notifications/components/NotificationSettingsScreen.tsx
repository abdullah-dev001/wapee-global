import { launch } from '@/config/launch';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { TimePicker } from '@/components/shared';
import {
  Button,
  Card,
  ErrorState,
  NumberStepper,
  Skeleton,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme, useBreakpoint } from '@/lib/theme';

import {
  SaveNotificationSettingsError,
  useNotificationSettings,
  useSaveNotificationSettings,
} from '../api/useNotificationSettings';
import { useMessagePreview } from '../api/useMessagePreview';
import { useSmsBalance } from '../api/useSmsCredits';
import { smsReadiness } from '../messageLogic';
import {
  notificationSettingsSchema,
  sameSettings,
  type NotificationSettings,
} from '../schemas/notificationSettings.schema';
import { MessagePreviewCard } from './MessagePreviewCard';

/**
 * Per-branch notification settings: reminders, review requests, SMS on/off and
 * quiet hours, with a preview of what customers get. Edits are held in a draft
 * and saved with one button; the database validates again.
 */
export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { isDesktop } = useBreakpoint();
  const { businessId, branchId } = useCurrentScope();
  const canEdit = usePermission('settings.booking', branchId);
  const canSeeCredits = usePermission('sms.send');

  const settings = useNotificationSettings(businessId, branchId);
  const save = useSaveNotificationSettings(businessId, branchId);
  const balance = useSmsBalance(canSeeCredits.allowed ? businessId : null);
  // The SMS cost of the most common message, to tell the owner whether SMS can go out.
  const smsPreview = useMessagePreview({
    businessId,
    branchId,
    event: 'booking_confirmed',
    channel: 'sms',
  });

  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const saved = settings.data ?? null;
  const current = draft ?? saved;
  const dirty = draft !== null && saved !== null && !sameSettings(draft, saved);
  const editable = canEdit.allowed;

  const update = (patch: Partial<NotificationSettings>) => {
    if (!current) return;
    setDraft({ ...current, ...patch });
  };

  const onSave = () => {
    if (!draft) return;
    const parsed = notificationSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      toast.show({ message: t('notifications.settings.saveError'), tone: 'error' });
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        setDraft(null);
        toast.show({ message: t('notifications.settings.saved'), tone: 'success' });
      },
      onError: (error) =>
        toast.show({
          message:
            error instanceof SaveNotificationSettingsError && error.message === 'forbidden'
              ? t('notifications.settings.noPermission')
              : t('notifications.settings.saveError'),
          tone: 'error',
        }),
    });
  };

  const readiness = current
    ? smsReadiness({
        smsEnabled: current.smsEnabled,
        balance: canSeeCredits.allowed ? (balance.data ?? null) : null,
        rateAvailable: smsPreview.data?.rateAvailable ?? null,
        creditsPerMessage: smsPreview.data?.credits ?? null,
      })
    : 'off';

  const body = settings.isError ? (
    <ErrorState
      title={t('notifications.settings.loadError')}
      onRetry={() => void settings.refetch()}
      retryLabel={t('actions.retry')}
    />
  ) : !current ? (
    <View style={styles.stack}>
      {[0, 1, 2].map((n) => (
        <Card key={n}>
          <Skeleton height={18} width="40%" />
          <Skeleton height={44} style={styles.skeletonGap} />
        </Card>
      ))}
    </View>
  ) : (
    <View style={styles.stack}>
      {!editable ? (
        <Text variant="helper" color="textSecondary">
          {t('notifications.settings.readOnly')}
        </Text>
      ) : null}

      <Card>
        <View style={styles.stack}>
          <Text variant="cardTitle">{t('notifications.settings.remindersTitle')}</Text>
          <Toggle
            label={t('notifications.settings.remindersToggle')}
            value={current.remindersEnabled}
            onValueChange={(v) => update({ remindersEnabled: v })}
            disabled={!editable}
          />
          {current.remindersEnabled ? (
            <NumberStepper
              label={t('notifications.settings.reminderHours')}
              suffix={t('notifications.settings.hoursSuffix')}
              hint={t('notifications.settings.hoursHint')}
              value={current.reminderHoursBefore}
              onChange={(v) => update({ reminderHoursBefore: v })}
              min={1}
              max={72}
              disabled={!editable}
            />
          ) : null}
        </View>
      </Card>

      <Card>
        <View style={styles.stack}>
          <Text variant="cardTitle">{t('notifications.settings.reviewTitle')}</Text>
          <Toggle
            label={t('notifications.settings.reviewToggle')}
            value={current.reviewRequestsEnabled}
            onValueChange={(v) => update({ reviewRequestsEnabled: v })}
            disabled={!editable}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.stack}>
          <Text variant="cardTitle">{t('notifications.settings.smsTitle')}</Text>
          {launch.sms ? (
            <>
              <Toggle
                label={t('notifications.settings.smsToggle')}
                value={current.smsEnabled}
                onValueChange={(v) => update({ smsEnabled: v })}
                disabled={!editable}
              />
              <Text variant="helper" color="textSecondary">
                {t('notifications.settings.smsHint')}
              </Text>
              {current.smsEnabled ? (
                <Text variant="helper" color={readiness === 'ready' ? 'success' : 'warning'}>
                  {t(
                    readiness === 'no_rate'
                      ? 'notifications.settings.smsNoRate'
                      : readiness === 'no_credits'
                        ? 'notifications.settings.smsNoCredits'
                        : 'notifications.settings.smsReady',
                  )}
                </Text>
              ) : null}
              {canSeeCredits.allowed ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push('/settings/sms-credits')}
                >
                  {t('notifications.settings.viewCredits')}
                </Button>
              ) : null}
            </>
          ) : (
            <Text variant="helper" color="textSecondary">
              {t('notifications.settings.smsComingSoon')}
            </Text>
          )}
        </View>
      </Card>

      <Card>
        <View style={styles.stack}>
          <Text variant="cardTitle">{t('notifications.settings.quietTitle')}</Text>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <TimePicker
                label={t('notifications.settings.quietStart')}
                value={current.quietStartMinute}
                onChange={(v) => update({ quietStartMinute: Math.min(v, 1439) })}
                disabled={!editable}
              />
            </View>
            <View style={styles.rowItem}>
              <TimePicker
                label={t('notifications.settings.quietEnd')}
                value={current.quietEndMinute}
                onChange={(v) => update({ quietEndMinute: Math.min(v, 1439) })}
                disabled={!editable}
              />
            </View>
          </View>
          <Text variant="helper" color="textSecondary">
            {t('notifications.settings.quietHint')}
          </Text>
        </View>
      </Card>

      {editable ? (
        <Button
          onPress={onSave}
          loading={save.isPending}
          disabled={!dirty || save.isPending}
          fullWidth={!isDesktop}
        >
          {t('notifications.settings.save')}
        </Button>
      ) : null}
    </View>
  );

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('notifications.hub.settingsTitle')}
        subtitle={t('notifications.settings.subtitle')}
      >
        <View style={isDesktop ? styles.twoColumn : styles.stack}>
          <View style={isDesktop ? styles.main : styles.stack}>{body}</View>
          <View style={isDesktop ? styles.side : undefined}>
            <MessagePreviewCard businessId={businessId} branchId={branchId} />
          </View>
        </View>
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[16] },
  twoColumn: { flexDirection: 'row', gap: theme.spacing[24], alignItems: 'flex-start' },
  main: { flex: 1, gap: theme.spacing[16] },
  side: { flex: 1 },
  row: { flexDirection: 'row', gap: theme.spacing[12] },
  rowItem: { flex: 1 },
  skeletonGap: { marginTop: theme.spacing[12] },
});
