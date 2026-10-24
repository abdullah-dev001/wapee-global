import { CreditCard, Mail } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  SegmentedControl,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { brand } from '@/config/brand';
import {
  addonOffered,
  formatAmount,
  type Period,
  type PublicAddon,
  type PublicPlan,
} from '@/features/landing/pricingModel';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { BillingActionError, useBillingActions } from '../api/useBillingActions';
import { useMyBilling, type BillingInterval, type MyBilling } from '../api/useMyBilling';
import { usePublicPricing } from '../api/usePublicPricing';

type Confirm = { title: string; body: string; onConfirm: () => void };

/**
 * The self-service half of the Owner billing screen, shown only behind `launch.billingCheckout`
 * on web (BillingScreen gates it): subscribe / change / cancel / resume a plan, manage payment &
 * invoices (Polar portal), and add / remove add-ons. Every rule is enforced server-side by
 * `billing_prepare`; this only words the result. Prices come from `get_public_pricing`.
 */
export function BillingCheckoutSection({ businessId }: { businessId: string | null }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { business, branchId } = useCurrentScope();
  const billing = useMyBilling(businessId);
  const pricing = usePublicPricing();
  const actions = useBillingActions(businessId);

  const zone = useMemo(
    () => business?.branches.find((b) => b.id === branchId)?.timezone ?? 'UTC',
    [business, branchId],
  );
  const fmtDate = (iso: string | null) =>
    iso ? formatDate(iso as UtcIso, zone, i18n.language, 'medium') : '';

  const planInterval = billing.data?.plan?.interval ?? 'month';
  const [period, setPeriod] = useState<Period>(planInterval === 'year' ? 'yearly' : 'monthly');
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const run = async (fn: () => Promise<void>, notify = false) => {
    try {
      await fn();
      if (notify) toast.show({ message: t('plans.billing.checkout.done'), tone: 'success' });
    } catch (err) {
      const code = err instanceof BillingActionError ? err.code : 'server_error';
      // Dynamic key (one of many server codes); a known literal supplies the fallback.
      const tLoose = t as unknown as (k: string, o: { defaultValue: string }) => string;
      toast.show({
        message: tLoose(`plans.billing.actionErrors.${code}`, {
          defaultValue: t('plans.billing.actionErrors.server_error'),
        }),
        tone: 'error',
      });
    }
  };

  if (billing.isError || pricing.isError) {
    return (
      <ErrorState
        title={t('plans.billing.loadError')}
        onRetry={() => {
          void billing.refetch();
          void pricing.refetch();
        }}
        retryLabel={t('actions.retry')}
      />
    );
  }
  if (billing.isPending || pricing.isPending || !billing.data || !pricing.data) {
    return <Skeleton height={220} radius="lg" />;
  }

  const b = billing.data;
  const interval: BillingInterval = period === 'yearly' ? 'year' : 'month';

  // A super admin assigned the plan by hand: no self-service, just point at us.
  if (b.billingSource === 'manual' && b.currentPlan) {
    return (
      <Card>
        <View style={styles.stack}>
          <Text variant="sectionTitle">{t('plans.billing.changeTitle')}</Text>
          <Text variant="paragraph" color="textSecondary">
            {t('plans.billing.checkout.manualManaged')}
          </Text>
          <View style={styles.left}>
            <Button
              startIcon={Mail}
              variant="secondary"
              onPress={() =>
                void Linking.openURL(
                  `mailto:${brand.supportEmail}?subject=${encodeURIComponent(
                    t('plans.billing.emailSubject', { business: business?.name ?? '' }),
                  )}`,
                )
              }
            >
              {t('plans.billing.contact')}
            </Button>
          </View>
        </View>
      </Card>
    );
  }

  const hasPolarPlan = b.billingSource === 'polar' && b.plan !== null;

  return (
    <View style={styles.stack}>
      <Card>
        <View style={styles.stack}>
          <Text variant="sectionTitle">
            {hasPolarPlan ? t('plans.billing.changeTitle') : t('plans.billing.checkout.title')}
          </Text>
          {!hasPolarPlan ? (
            <Text variant="paragraph" color="textSecondary">
              {t('plans.billing.checkout.subtitle')}
            </Text>
          ) : null}
          <StatusLine billing={b} fmtDate={fmtDate} />
          <SegmentedControl
            options={[
              { value: 'monthly', label: t('plans.billing.checkout.monthly') },
              { value: 'yearly', label: t('plans.billing.checkout.yearly') },
            ]}
            value={period}
            onChange={setPeriod}
          />
          <View style={styles.stack}>
            {pricing.data.plans.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                period={period}
                locale={i18n.language}
                current={hasPolarPlan && b.plan?.key === plan.key}
                hasPolarPlan={hasPolarPlan}
                cancelScheduled={b.plan?.cancelAtPeriodEnd === true}
                busy={anyPending(actions)}
                onSubscribe={() =>
                  void run(() =>
                    actions.checkout.mutateAsync({ kind: 'plan', key: plan.key, interval }),
                  )
                }
                onSwitch={() =>
                  setConfirm({
                    title: t('plans.billing.checkout.confirmSwitchTitle'),
                    body: t('plans.billing.checkout.confirmSwitchBody', { plan: plan.name }),
                    onConfirm: () =>
                      void run(
                        () => actions.changePlan.mutateAsync({ key: plan.key, interval }),
                        true,
                      ),
                  })
                }
                onCancel={() =>
                  setConfirm({
                    title: t('plans.billing.checkout.confirmCancelTitle'),
                    body: t('plans.billing.checkout.confirmCancelBody', {
                      date: fmtDate(b.plan?.currentPeriodEnd ?? null),
                    }),
                    onConfirm: () => void run(() => actions.cancel.mutateAsync(), true),
                  })
                }
                onUncancel={() => void run(() => actions.uncancel.mutateAsync(), true)}
              />
            ))}
          </View>
          {b.hasBillingAccount ? (
            <View style={styles.left}>
              <Button
                variant="ghost"
                startIcon={CreditCard}
                loading={actions.portal.isPending}
                onPress={() => void run(() => actions.portal.mutateAsync())}
              >
                {t('plans.billing.checkout.manage')}
              </Button>
            </View>
          ) : null}
        </View>
      </Card>

      {hasPolarPlan && b.plan ? (
        <AddonsCard
          billing={b}
          addons={pricing.data.addons}
          currentPlanKey={b.plan.key}
          plans={pricing.data.plans}
          fmtDate={fmtDate}
          busy={anyPending(actions)}
          onAdd={(key) =>
            void run(() =>
              actions.checkout.mutateAsync({ kind: 'addon', key, interval: planInterval }),
            )
          }
          onKeep={(key) => void run(() => actions.keepAddon.mutateAsync({ key }), true)}
          onRemove={(key, name) =>
            setConfirm({
              title: t('plans.billing.checkout.confirmRemoveTitle', { addon: name }),
              body: t('plans.billing.checkout.confirmRemoveBody'),
              onConfirm: () => void run(() => actions.removeAddon.mutateAsync({ key }), true),
            })
          }
        />
      ) : null}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        message={confirm?.body}
        confirm={{
          label: t('plans.billing.checkout.confirmYes'),
          onPress: () => {
            confirm?.onConfirm();
            setConfirm(null);
          },
        }}
      />
    </View>
  );
}

function anyPending(actions: ReturnType<typeof useBillingActions>): boolean {
  return (
    actions.checkout.isPending ||
    actions.changePlan.isPending ||
    actions.changeSeats.isPending ||
    actions.cancel.isPending ||
    actions.uncancel.isPending ||
    actions.removeAddon.isPending ||
    actions.keepAddon.isPending
  );
}

function StatusLine({
  billing,
  fmtDate,
}: {
  billing: MyBilling;
  fmtDate: (iso: string | null) => string;
}) {
  const { t } = useTranslation();
  const plan = billing.plan;
  if (!plan) return null;
  if (plan.polarStatus === 'past_due' && plan.pastDueUntil) {
    return (
      <Text variant="paragraph" color="warning">
        {t('plans.billing.checkout.pastDue', { date: fmtDate(plan.pastDueUntil) })}
      </Text>
    );
  }
  if (plan.cancelAtPeriodEnd) {
    return (
      <Text variant="paragraph" color="warning">
        {t('plans.billing.checkout.cancelsOn', { date: fmtDate(plan.currentPeriodEnd) })}
      </Text>
    );
  }
  return (
    <Text variant="paragraph" color="textSecondary">
      {plan.polarStatus === 'trialing'
        ? t('plans.billing.checkout.trialingThenRenews', { date: fmtDate(plan.currentPeriodEnd) })
        : t('plans.billing.checkout.renewsOn', { date: fmtDate(plan.currentPeriodEnd) })}
    </Text>
  );
}

function PlanCard({
  plan,
  period,
  locale,
  current,
  hasPolarPlan,
  cancelScheduled,
  busy,
  onSubscribe,
  onSwitch,
  onCancel,
  onUncancel,
}: {
  plan: PublicPlan;
  period: Period;
  locale: string;
  current: boolean;
  hasPolarPlan: boolean;
  cancelScheduled: boolean;
  busy: boolean;
  onSubscribe: () => void;
  onSwitch: () => void;
  onCancel: () => void;
  onUncancel: () => void;
}) {
  const { t } = useTranslation();
  const price = formatAmount(
    period === 'yearly' ? plan.annualMinor : plan.monthlyMinor,
    plan.currency,
    locale,
  );
  const unitLabel = plan.perBranch
    ? period === 'yearly'
      ? t('plans.billing.checkout.perSeatYear', { price })
      : t('plans.billing.checkout.perSeatMonth', { price })
    : period === 'yearly'
      ? t('plans.billing.checkout.perYear', { price })
      : t('plans.billing.checkout.perMonth', { price });
  return (
    <View style={[styles.planRow, current ? styles.planRowCurrent : null]}>
      <View style={styles.grow}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong">{plan.name}</Text>
          {current ? (
            <Badge tone="success">{t('plans.billing.checkout.currentBadge')}</Badge>
          ) : null}
        </View>
        <Text variant="helper" color="textSecondary">
          {unitLabel}
        </Text>
      </View>
      <View style={styles.planActions}>
        {!hasPolarPlan ? (
          <Button size="sm" disabled={busy} onPress={onSubscribe}>
            {t('plans.billing.checkout.subscribe')}
          </Button>
        ) : current ? (
          cancelScheduled ? (
            <Button size="sm" variant="secondary" disabled={busy} onPress={onUncancel}>
              {t('plans.billing.checkout.uncancel')}
            </Button>
          ) : (
            <Button size="sm" variant="danger" disabled={busy} onPress={onCancel}>
              {t('plans.billing.checkout.cancel')}
            </Button>
          )
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || cancelScheduled}
            onPress={onSwitch}
          >
            {t('plans.billing.checkout.switchTo')}
          </Button>
        )}
      </View>
    </View>
  );
}

function AddonsCard({
  billing,
  addons,
  currentPlanKey,
  plans,
  fmtDate,
  busy,
  onAdd,
  onKeep,
  onRemove,
}: {
  billing: MyBilling;
  addons: PublicAddon[];
  currentPlanKey: string;
  plans: PublicPlan[];
  fmtDate: (iso: string | null) => string;
  busy: boolean;
  onAdd: (key: string) => void;
  onKeep: (key: string) => void;
  onRemove: (key: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const plan = plans.find((p) => p.key === currentPlanKey);
  const offered = plan ? addons.filter((a) => addonOffered(a, plan)) : [];
  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="sectionTitle">{t('plans.billing.checkout.addonsTitle')}</Text>
        {offered.length === 0 ? (
          <Text variant="helper" color="textSecondary">
            {t('plans.billing.checkout.addonUnavailableOnPlan')}
          </Text>
        ) : (
          offered.map((addon) => {
            const live = billing.addons.find((a) => a.key === addon.key);
            return (
              <View key={addon.key} style={styles.titleRow}>
                <View style={styles.grow}>
                  <Text variant="body">{addon.name}</Text>
                  {live?.cancelAtPeriodEnd ? (
                    <Text variant="helper" color="warning">
                      {t('plans.billing.checkout.addonEndsOn', { date: fmtDate(live.accessUntil) })}
                    </Text>
                  ) : null}
                </View>
                {!live ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => onAdd(addon.key)}
                  >
                    {t('plans.billing.checkout.addonAdd')}
                  </Button>
                ) : live.cancelAtPeriodEnd ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => onKeep(addon.key)}
                  >
                    {t('plans.billing.checkout.addonKeep')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onPress={() => onRemove(addon.key, addon.name)}
                  >
                    {t('plans.billing.checkout.addonRemove')}
                  </Button>
                )}
              </View>
            );
          })
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  left: { alignItems: 'flex-start' },
  grow: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[8],
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.border,
  },
  planRowCurrent: {},
  planActions: { alignItems: 'flex-end' },
});
