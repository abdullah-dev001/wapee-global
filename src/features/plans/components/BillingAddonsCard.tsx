import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { addonOffered, type PublicAddon, type PublicPlan } from '@/features/landing/pricingModel';
import { theme } from '@/lib/theme';

import { type MyBilling } from '../api/useMyBilling';

/** Add-ons of `BillingCheckoutSection` for the current Polar plan: add, keep, remove. */
export function BillingAddonsCard({
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
  grow: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
});
