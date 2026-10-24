import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Text } from '@/components/ui';
import { formatAmount, type Period, type PublicPlan } from '@/features/landing/pricingModel';
import { theme } from '@/lib/theme';

/** One plan row of `BillingCheckoutSection`: price for the chosen period and its one action. */
export function BillingPlanCard({
  plan,
  period,
  locale,
  current,
  picked,
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
  /** The plan picked before signup (landing button / team size); only a label, nothing is bought. */
  picked: boolean;
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
    <View style={styles.planRow}>
      <View style={styles.grow}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong">{plan.name}</Text>
          {current ? (
            <Badge tone="success">{t('plans.billing.checkout.currentBadge')}</Badge>
          ) : picked ? (
            <Badge tone="primary">{t('plans.billing.checkout.pickedBadge')}</Badge>
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

const styles = StyleSheet.create({
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
  planActions: { alignItems: 'flex-end' },
});
