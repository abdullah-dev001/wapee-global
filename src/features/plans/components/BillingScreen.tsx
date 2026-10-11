import { Mail } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Badge, Button, Card, ErrorState, Skeleton, Text, type BadgeTone } from '@/components/ui';
import { brand } from '@/config/brand';
import { trialCountdown } from '@/features/billing/trialCountdown';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { usePlanUsage, useMyFeatures } from '../api/useMyFeatures';
import { useBillingInfo } from '../api/useBilling';
import {
  ADDON_FEATURE_KEYS,
  isAtCap,
  isFeatureOn,
  usageRatio,
  type SubscriptionStatus,
} from '../featureLogic';

const STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  trialing: 'info',
  active: 'success',
  inactive: 'warning',
  suspended: 'error',
};

/**
 * Billing for the Owner (settings.billing): current plan, status, trial end, the
 * add-ons that are on, and staff usage against the cap. Read-only: there are no
 * payments; changing a plan means contacting us.
 */
export function BillingScreen() {
  const { t, i18n } = useTranslation();
  const { businessId, business, branchId } = useCurrentScope();
  const features = useMyFeatures(businessId);
  const usage = usePlanUsage(businessId);
  const info = useBillingInfo(businessId);

  const zone = useMemo(
    () => business?.branches.find((b) => b.id === branchId)?.timezone ?? 'UTC',
    [business, branchId],
  );

  const mailto = `mailto:${brand.supportEmail}?subject=${encodeURIComponent(
    t('plans.billing.emailSubject', { business: business?.name ?? '' }),
  )}`;

  const loading = features.isPending || usage.isPending || info.isPending;
  const failed = features.isError || usage.isError || info.isError;
  const plan = features.data;

  const retry = () => {
    void features.refetch();
    void usage.refetch();
    void info.refetch();
  };

  return (
    <Screen edges={['top']}>
      <PageContainer title={t('plans.billing.title')} subtitle={t('plans.billing.subtitle')}>
        {failed ? (
          <ErrorState
            title={t('plans.billing.loadError')}
            onRetry={retry}
            retryLabel={t('actions.retry')}
          />
        ) : loading || !plan ? (
          <View style={styles.stack}>
            <Skeleton height={120} radius="lg" />
            <Skeleton height={160} radius="lg" />
            <Skeleton height={120} radius="lg" />
          </View>
        ) : (
          <View style={styles.stack}>
            <Card>
              <View style={styles.stack}>
                <View style={styles.rowBetween}>
                  <Text variant="label" color="textSecondary">
                    {t('plans.billing.currentPlan')}
                  </Text>
                  <Badge tone={STATUS_TONE[plan.status]}>{t(`plans.status.${plan.status}`)}</Badge>
                </View>
                <Text variant="statValue">
                  {plan.trial
                    ? t('plans.billing.trialPlan')
                    : plan.plan
                      ? (info.data?.planNames[plan.plan] ?? t(`plans.names.${plan.plan}`))
                      : t('plans.billing.noPlan')}
                </Text>
                <PlanDates
                  status={plan.status}
                  trialEndsAt={business?.trial_ends_at ?? null}
                  periodEnd={info.data?.periodEnd ?? null}
                  zone={zone}
                  locale={i18n.language}
                />
                {plan.status === 'suspended' ? (
                  <Text variant="helper" color="textSecondary">
                    {t('plans.billing.suspendedNote')}
                  </Text>
                ) : null}
                <Text variant="helper" color="textMuted">
                  {t('plans.billing.dataSafe')}
                </Text>
              </View>
            </Card>

            <Card>
              <View style={styles.stack}>
                <Text variant="sectionTitle">{t('plans.billing.usageTitle')}</Text>
                {usage.data && usage.data.branches.length > 0 ? (
                  usage.data.branches.map((b) => (
                    <UsageRow
                      key={b.id}
                      label={b.name}
                      used={b.activeStaff}
                      cap={usage.data?.staffCap ?? null}
                    />
                  ))
                ) : (
                  <Text variant="helper" color="textSecondary">
                    {t('plans.billing.noLocations')}
                  </Text>
                )}
                <Text variant="helper" color="textSecondary">
                  {usage.data?.maxBranches === null
                    ? t('plans.billing.locationsUnlimited', { count: usage.data?.branchCount ?? 0 })
                    : t('plans.billing.locationsOf', {
                        used: usage.data?.branchCount ?? 0,
                        max: usage.data?.maxBranches ?? 0,
                      })}
                </Text>
              </View>
            </Card>

            <Card>
              <View style={styles.stack}>
                <Text variant="sectionTitle">{t('plans.billing.addonsTitle')}</Text>
                {(info.data?.addons ?? []).map((addon) => {
                  const key = ADDON_FEATURE_KEYS.find((k) => k === addon.key);
                  const on = key ? isFeatureOn(plan.features, key) : false;
                  return (
                    <View key={addon.key} style={styles.rowBetween}>
                      <Text variant="body" style={styles.grow}>
                        {addon.name}
                      </Text>
                      <Badge tone={on ? 'success' : 'neutral'}>
                        {on ? t('plans.billing.addonOn') : t('plans.billing.addonOff')}
                      </Badge>
                    </View>
                  );
                })}
                {plan.trial ? (
                  <Text variant="helper" color="textSecondary">
                    {t('plans.billing.trialAddons')}
                  </Text>
                ) : null}
              </View>
            </Card>

            <Card>
              <View style={styles.stack}>
                <Text variant="sectionTitle">{t('plans.billing.changeTitle')}</Text>
                <Text variant="paragraph" color="textSecondary">
                  {t('plans.billing.changeBody')}
                </Text>
                <View style={styles.action}>
                  <Button
                    startIcon={Mail}
                    onPress={() => {
                      void Linking.openURL(mailto);
                    }}
                  >
                    {t('plans.billing.contact')}
                  </Button>
                </View>
              </View>
            </Card>
          </View>
        )}
      </PageContainer>
    </Screen>
  );
}

function PlanDates({
  status,
  trialEndsAt,
  periodEnd,
  zone,
  locale,
}: {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  periodEnd: string | null;
  zone: string;
  locale: string;
}) {
  const { t } = useTranslation();
  if (status === 'trialing' && trialEndsAt) {
    const { daysLeft } = trialCountdown(trialEndsAt, status);
    const over = new Date(trialEndsAt) <= new Date();
    return (
      <Text variant="paragraph" color="textSecondary">
        {over
          ? t('plans.billing.trialEnded', {
              date: formatDate(trialEndsAt as UtcIso, zone, locale, 'medium'),
            })
          : t('plans.billing.trialEnds', {
              date: formatDate(trialEndsAt as UtcIso, zone, locale, 'medium'),
              count: daysLeft,
            })}
      </Text>
    );
  }
  if (status === 'active' && periodEnd) {
    return (
      <Text variant="paragraph" color="textSecondary">
        {t('plans.billing.periodEnds', {
          date: formatDate(periodEnd as UtcIso, zone, locale, 'medium'),
        })}
      </Text>
    );
  }
  return null;
}

function UsageRow({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const { t } = useTranslation();
  const ratio = usageRatio(used, cap);
  const full = isAtCap(used, cap);
  return (
    <View style={styles.usage}>
      <View style={styles.rowBetween}>
        <Text variant="bodyStrong" style={styles.grow} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="body" color={full ? 'warning' : 'textSecondary'}>
          {cap === null
            ? t('plans.billing.staffUnlimited', { count: used })
            : t('plans.billing.staffOf', { used, cap })}
        </Text>
      </View>
      {ratio !== null ? (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: cap ?? 0, now: used }}
        >
          <View
            style={[
              styles.fill,
              { width: `${Math.round(ratio * 100)}%` },
              full ? styles.fillFull : null,
            ]}
          />
        </View>
      ) : null}
    </View>
  );
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
  action: { alignItems: 'flex-start' },
  usage: { gap: theme.spacing[6] },
  track: {
    height: theme.spacing[6],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  fillFull: { backgroundColor: theme.colors.warning },
});
