import { Controller } from 'react-hook-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared';
import { Badge, Button, Card, ErrorState, Skeleton, Text, Toggle } from '@/components/ui';
import { formatMinorAsMajor, formatMoney, parseMajorToMinor } from '@/lib/money';
import { theme } from '@/lib/theme';

import { AdminRpcError } from '../adminLogic';
import {
  usePlansCatalogue,
  useSaveAddonPrices,
  useSavePlanPrices,
  type AddonRow,
  type PlanRow,
} from '../api/useAdmin';
import {
  addonPricesSchema,
  planPricesSchema,
  type AddonPricesValues,
  type PlanPricesValues,
} from '../schemas/admin.schemas';
import { AdminFormDialog } from './AdminFormDialog';
import { useAdminMessage } from './useAdminMessage';

/** Prices are typed in major units ("39.00") and sent as integer minor units. */
function toMinor(input: string, currency: string): number {
  const minor = parseMajorToMinor(input, currency, 'en');
  if (minor === null) throw new AdminRpcError('invalid_input');
  return minor;
}

export function PricesEditor() {
  const { t, i18n } = useTranslation();
  const messageOf = useAdminMessage();
  const catalogue = usePlansCatalogue();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [addon, setAddon] = useState<AddonRow | null>(null);
  const savePlan = useSavePlanPrices();
  const saveAddon = useSaveAddonPrices();

  if (catalogue.isError) {
    return (
      <ErrorState
        title={messageOf(catalogue.error)}
        onRetry={() => void catalogue.refetch()}
        retryLabel={t('actions.retry')}
      />
    );
  }
  if (catalogue.isPending) return <Skeleton height={200} radius="lg" />;

  return (
    <View style={styles.stack}>
      <Text variant="helper" color="textSecondary">
        {t('admin.prices.hint')}
      </Text>
      {catalogue.data.plans.map((p) => (
        <Card key={p.key}>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text variant="cardTitle">{p.name}</Text>
              <Text variant="helper" color="textSecondary">
                {t('admin.prices.planLine', {
                  monthly: formatMoney(
                    { amountMinor: p.priceMonthlyMinor, currency: p.currency },
                    i18n.language,
                  ),
                  annual: formatMoney(
                    { amountMinor: p.priceAnnualMinor, currency: p.currency },
                    i18n.language,
                  ),
                  staff: p.staffCap ?? t('admin.detail.unlimited'),
                })}
              </Text>
            </View>
            {p.active ? null : <Badge tone="neutral">{t('admin.prices.inactive')}</Badge>}
            <Button size="sm" variant="secondary" onPress={() => setPlan(p)}>
              {t('actions.edit')}
            </Button>
          </View>
        </Card>
      ))}
      <Text variant="sectionTitle">{t('admin.prices.addons')}</Text>
      {catalogue.data.addons.map((a) => (
        <Card key={a.key}>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text variant="cardTitle">{a.name}</Text>
              <Text variant="helper" color="textSecondary">
                {t('admin.prices.addonLine', {
                  monthly: formatMoney(
                    { amountMinor: a.priceMonthlyMinor, currency: a.currency },
                    i18n.language,
                  ),
                })}
              </Text>
            </View>
            {a.active ? null : <Badge tone="neutral">{t('admin.prices.inactive')}</Badge>}
            <Button size="sm" variant="secondary" onPress={() => setAddon(a)}>
              {t('actions.edit')}
            </Button>
          </View>
        </Card>
      ))}

      <AdminFormDialog<PlanPricesValues>
        open={plan !== null}
        onClose={() => setPlan(null)}
        title={t('admin.prices.editPlan', { name: plan?.name ?? '' })}
        auditNote={t('admin.audited')}
        confirmLabel={t('actions.save')}
        schema={planPricesSchema}
        defaultValues={{
          name: plan?.name ?? '',
          monthly: plan ? formatMinorAsMajor(plan.priceMonthlyMinor, plan.currency) : '',
          annual: plan ? formatMinorAsMajor(plan.priceAnnualMinor, plan.currency) : '',
          currency: plan?.currency ?? 'USD',
          active: plan?.active ?? true,
        }}
        successMessage={t('admin.prices.saved')}
        onSubmit={(v) =>
          savePlan.mutateAsync({
            key: plan?.key ?? '',
            name: v.name,
            monthly: toMinor(v.monthly, v.currency),
            annual: toMinor(v.annual, v.currency),
            currency: v.currency,
            active: v.active,
          })
        }
      >
        {(control) => (
          <>
            <FormField control={control} name="name" label={t('admin.prices.name')} />
            <FormField
              control={control}
              name="currency"
              label={t('admin.prices.currency')}
              autoCapitalize="characters"
              maxLength={3}
            />
            <FormField
              control={control}
              name="monthly"
              label={t('admin.prices.monthly')}
              keyboardType="decimal-pad"
            />
            <FormField
              control={control}
              name="annual"
              label={t('admin.prices.annual')}
              keyboardType="decimal-pad"
            />
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Toggle
                  value={field.value}
                  onValueChange={field.onChange}
                  label={t('admin.prices.active')}
                />
              )}
            />
          </>
        )}
      </AdminFormDialog>

      <AdminFormDialog<AddonPricesValues>
        open={addon !== null}
        onClose={() => setAddon(null)}
        title={t('admin.prices.editAddon', { name: addon?.name ?? '' })}
        auditNote={t('admin.audited')}
        confirmLabel={t('actions.save')}
        schema={addonPricesSchema}
        defaultValues={{
          name: addon?.name ?? '',
          monthly: addon ? formatMinorAsMajor(addon.priceMonthlyMinor, addon.currency) : '',
          currency: addon?.currency ?? 'USD',
          active: addon?.active ?? true,
        }}
        successMessage={t('admin.prices.saved')}
        onSubmit={(v) =>
          saveAddon.mutateAsync({
            key: addon?.key ?? '',
            name: v.name,
            monthly: toMinor(v.monthly, v.currency),
            currency: v.currency,
            active: v.active,
          })
        }
      >
        {(control) => (
          <>
            <FormField control={control} name="name" label={t('admin.prices.name')} />
            <FormField
              control={control}
              name="currency"
              label={t('admin.prices.currency')}
              autoCapitalize="characters"
              maxLength={3}
            />
            <FormField
              control={control}
              name="monthly"
              label={t('admin.prices.monthly')}
              keyboardType="decimal-pad"
            />
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Toggle
                  value={field.value}
                  onValueChange={field.onChange}
                  label={t('admin.prices.active')}
                />
              )}
            />
          </>
        )}
      </AdminFormDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[12] },
  grow: { flex: 1, gap: theme.spacing[2] },
});
