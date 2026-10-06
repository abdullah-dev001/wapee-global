import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  Skeleton,
  Text,
  Toggle,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { statusKey } from '@/features/plans/featureLogic';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { useAdminBusinessDetail, useSetAddon, type AdminAddon } from '../api/useAdmin';
import {
  AddCreditsDialog,
  AssignPlanDialog,
  ExtendTrialDialog,
  SetStatusDialog,
} from './AdminActionDialogs';
import { AdminReviewsSection } from './AdminReviewsSection';
import { AdminScreen } from './AdminScreen';
import { SupportViewSection } from './SupportViewSection';
import { useAdminMessage } from './useAdminMessage';

const STATUS_TONE: Record<string, BadgeTone> = {
  trialing: 'info',
  active: 'success',
  inactive: 'warning',
  suspended: 'error',
};
type DialogName = 'plan' | 'status' | 'trial' | 'credits' | null;

/** One business for the super admin: subscription, usage, add-ons, actions, reviews, support view. */
export function BusinessDetailScreen() {
  const { t, i18n } = useTranslation();
  const statusText = (_t: typeof t, status: string) => {
    const key = statusKey(status);
    return key ? t(key) : status;
  };
  const { id } = useLocalSearchParams<{ id: string }>();
  const businessId = typeof id === 'string' ? id : '';
  const messageOf = useAdminMessage();
  const detail = useAdminBusinessDetail(businessId);
  const [dialog, setDialog] = useState<DialogName>(null);
  const close = () => setDialog(null);
  const d = detail.data;

  return (
    <AdminScreen title={d?.business.name ?? t('admin.detail.title')} subtitle={d?.business.slug}>
      {detail.isError ? (
        <ErrorState
          title={messageOf(detail.error)}
          onRetry={() => void detail.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : detail.isPending || !d ? (
        <View style={styles.stack}>
          <Skeleton height={140} radius="lg" />
          <Skeleton height={140} radius="lg" />
          <Skeleton height={180} radius="lg" />
        </View>
      ) : (
        <View style={styles.stack}>
          <Card>
            <View style={styles.stack}>
              <View style={styles.rowBetween}>
                <Text variant="sectionTitle">{t('admin.detail.subscription')}</Text>
                <Badge tone={STATUS_TONE[d.subscription.status] ?? 'neutral'}>
                  {statusText(t, d.subscription.status)}
                </Badge>
              </View>
              <Fact label={t('admin.detail.plan')}>
                {d.subscription.plan
                  ? t(`plans.names.${planKey(d.subscription.plan)}`)
                  : t('admin.businesses.noPlan')}
              </Fact>
              <Fact label={t('admin.detail.active')}>
                {d.isActive ? t('admin.detail.yes') : t('admin.detail.no')}
              </Fact>
              {d.subscription.trialEndsAt ? (
                <Fact label={t('admin.detail.trialEnds')}>
                  {formatDate(d.subscription.trialEndsAt as UtcIso, 'UTC', i18n.language, 'medium')}
                </Fact>
              ) : null}
              {d.subscription.periodEnd ? (
                <Fact label={t('admin.detail.periodEnds')}>
                  {formatDate(d.subscription.periodEnd as UtcIso, 'UTC', i18n.language, 'medium')}
                </Fact>
              ) : null}
              <Fact label={t('admin.detail.limits')}>
                {t('admin.detail.limitsValue', {
                  staff: d.limits.staffCap ?? t('admin.detail.unlimited'),
                  branches: d.limits.maxBranches ?? t('admin.detail.unlimited'),
                })}
              </Fact>
              {d.subscription.notes ? (
                <Fact label={t('admin.actions.notes')}>{d.subscription.notes}</Fact>
              ) : null}
              <View style={styles.buttons}>
                <Button onPress={() => setDialog('plan')}>
                  {t('admin.actions.assignPlan.title')}
                </Button>
                <Button variant="secondary" onPress={() => setDialog('trial')}>
                  {t('admin.actions.extendTrial.title')}
                </Button>
                <Button variant="danger" onPress={() => setDialog('status')}>
                  {t('admin.actions.setStatus.title')}
                </Button>
              </View>
            </View>
          </Card>

          <Card>
            <View style={styles.stack}>
              <Text variant="sectionTitle">{t('admin.detail.usage')}</Text>
              <Fact label={t('admin.detail.staff')}>{String(d.usage.staffActive)}</Fact>
              <Fact label={t('admin.detail.branches')}>{String(d.usage.branches)}</Fact>
              <Fact label={t('admin.detail.appointments')}>
                {String(d.usage.appointmentsThisMonth)}
              </Fact>
              <Fact label={t('admin.detail.invoices')}>{String(d.usage.invoicesIssued)}</Fact>
              <Fact label={t('admin.detail.smsBalance')}>
                {new Intl.NumberFormat(i18n.language).format(d.usage.smsBalance)}
              </Fact>
              <View style={styles.buttons}>
                <Button variant="secondary" onPress={() => setDialog('credits')}>
                  {t('admin.actions.credits.title')}
                </Button>
              </View>
            </View>
          </Card>

          <AddonsCard businessId={businessId} addons={d.addons} />
          <AdminReviewsSection businessId={businessId} />
          <SupportViewSection businessId={businessId} />
        </View>
      )}

      <AssignPlanDialog
        businessId={businessId}
        currentPlan={d?.subscription.plan ?? null}
        open={dialog === 'plan'}
        onClose={close}
      />
      <SetStatusDialog businessId={businessId} open={dialog === 'status'} onClose={close} />
      <ExtendTrialDialog businessId={businessId} open={dialog === 'trial'} onClose={close} />
      <AddCreditsDialog businessId={businessId} open={dialog === 'credits'} onClose={close} />
    </AdminScreen>
  );
}

function AddonsCard({ businessId, addons }: { businessId: string; addons: AdminAddon[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const messageOf = useAdminMessage();
  const setAddon = useSetAddon(businessId);
  const [pending, setPending] = useState<{ addon: AdminAddon; enabled: boolean } | null>(null);

  const confirm = () => {
    if (!pending) return;
    setAddon.mutate(
      { addon: pending.addon.key, enabled: pending.enabled },
      {
        onSuccess: () => {
          toast.show({ message: t('admin.addons.done'), tone: 'success' });
          setPending(null);
        },
        onError: (error) => {
          toast.show({ message: messageOf(error), tone: 'error' });
          setPending(null);
        },
      },
    );
  };

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="sectionTitle">{t('admin.addons.title')}</Text>
        {addons.map((addon) => (
          <View key={addon.key} style={styles.rowBetween}>
            <Text variant="body" style={styles.grow}>
              {addon.name}
            </Text>
            <Toggle
              value={addon.enabled}
              accessibilityLabel={addon.name}
              disabled={setAddon.isPending}
              onValueChange={(enabled) => setPending({ addon, enabled })}
            />
          </View>
        ))}
        <Text variant="helper" color="textSecondary">
          {t('admin.addons.trialNote')}
        </Text>
      </View>
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.enabled ? t('admin.addons.enableTitle') : t('admin.addons.disableTitle')}
        message={
          t('admin.addons.confirm', { name: pending?.addon.name ?? '' }) + ' ' + t('admin.audited')
        }
        cancelLabel={t('actions.cancel')}
        busy={setAddon.isPending}
        confirm={{
          label: pending?.enabled ? t('admin.addons.enable') : t('admin.addons.disable'),
          variant: pending?.enabled ? 'primary' : 'danger',
          loading: setAddon.isPending,
          onPress: confirm,
        }}
      />
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="label" color="textSecondary" style={styles.factLabel}>
        {label}
      </Text>
      <Text variant="body" style={styles.grow}>
        {children}
      </Text>
    </View>
  );
}

function planKey(plan: string): 'solo' | 'team' | 'business' {
  return plan === 'team' || plan === 'business' ? plan : 'solo';
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
  },
  grow: { flex: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
  fact: { flexDirection: 'row', gap: theme.spacing[12], alignItems: 'flex-start' },
  factLabel: { minWidth: theme.spacing[48] * 3 },
});
