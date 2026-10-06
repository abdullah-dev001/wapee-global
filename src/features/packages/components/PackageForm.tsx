import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField, IntegerInput, MoneyInput } from '@/components/shared';
import { Button, Text, Toggle, useToast } from '@/components/ui';
import { useServices } from '@/features/services/api/useServices';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useSavePackage, type PackageListItem } from '../api/usePackages';
import { packageErrorKey } from '../packageLogic';
import { emptyPackage, packageSchema, type PackageValues } from '../schemas/package.schemas';

/** Create or edit a package definition of the current branch. Sold packages are snapshots and never change. */
export function PackageForm({
  pkg,
  onDone,
}: {
  /** Undefined = creating a new one. */
  pkg?: PackageListItem;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const services = useServices(businessId, branchId, { includeInactive: false });
  const save = useSavePackage(businessId);

  // The currency is the BRANCH's (never the business's).
  const currency =
    pkg?.currency ?? business?.branches.find((b) => b.id === branchId)?.currency ?? 'USD';

  const { control, handleSubmit, setValue } = useForm<PackageValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: pkg
      ? {
          name: pkg.name,
          description: pkg.description ?? '',
          sessions: pkg.sessions,
          bonusSessions: pkg.bonusSessions,
          priceMinor: pkg.priceMinor,
          expiryDays: pkg.expiryDays,
          serviceIds: pkg.serviceIds,
          isActive: pkg.isActive,
        }
      : emptyPackage,
  });
  const serviceIds = useWatch({ control, name: 'serviceIds' });
  const isActive = useWatch({ control, name: 'isActive' });

  const onSubmit = handleSubmit((values) => {
    const target = pkg?.branchId ?? branchId;
    if (!target) return;
    save.mutate(
      { branchId: target, packageId: pkg?.id ?? null, values },
      {
        onSuccess: () => {
          toast.show({ message: t('packages.form.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) =>
          toast.show({ message: t(packageErrorKey(rpcCode(error))), tone: 'error' }),
      },
    );
  });

  const toggleIn = (list: string[], id: string, on: boolean) =>
    on ? [...list, id] : list.filter((entry) => entry !== id);

  return (
    // A plain View: `Drawer` already owns the scrolling body.
    <View style={styles.form}>
      <Text variant="helper" color="textSecondary">
        {t('packages.form.currencyFixed', { currency })}
      </Text>
      <FormField control={control} name="name" label={t('packages.form.name')} required />
      <FormField
        control={control}
        name="description"
        label={t('packages.form.description')}
        multiline
      />
      <View style={styles.row}>
        <View style={styles.half}>
          <Controller
            control={control}
            name="sessions"
            render={({ field, fieldState }) => (
              <IntegerInput
                label={t('packages.form.sessions')}
                value={field.value}
                onChange={(v) => field.onChange(v ?? 0)}
                error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
              />
            )}
          />
        </View>
        <View style={styles.half}>
          <Controller
            control={control}
            name="bonusSessions"
            render={({ field, fieldState }) => (
              <IntegerInput
                label={t('packages.form.bonusSessions')}
                hint={t('packages.form.bonusHint')}
                value={field.value}
                onChange={(v) => field.onChange(v ?? 0)}
                error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
              />
            )}
          />
        </View>
      </View>
      <Controller
        control={control}
        name="priceMinor"
        render={({ field, fieldState }) => (
          <MoneyInput
            label={t('packages.form.price')}
            value={field.value}
            onChange={(v) => field.onChange(v ?? 0)}
            currency={currency}
            locale={i18n.language}
            error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="expiryDays"
        render={({ field, fieldState }) => (
          <IntegerInput
            label={t('packages.form.expiryDays')}
            hint={t('packages.form.expiryHint')}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
          />
        )}
      />

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          {t('packages.form.services')}
        </Text>
        {services.data && services.data.length === 0 ? (
          <Text variant="helper" color="textMuted">
            {t('packages.form.noServices')}
          </Text>
        ) : (
          (services.data ?? []).map((service) => (
            <Toggle
              key={service.id}
              label={service.name}
              value={serviceIds.includes(service.id)}
              onValueChange={(on) =>
                setValue('serviceIds', toggleIn(serviceIds, service.id, on), {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            />
          ))
        )}
        <Controller
          control={control}
          name="serviceIds"
          render={({ fieldState }) =>
            fieldState.error?.message ? (
              <Text variant="helper" color="error">
                {t(fieldState.error.message as never)}
              </Text>
            ) : (
              <Text variant="helper" color="textMuted">
                {t('packages.form.servicesHint')}
              </Text>
            )
          }
        />
      </View>

      <Toggle
        label={t('packages.form.active')}
        value={isActive}
        onValueChange={(on) => setValue('isActive', on, { shouldDirty: true })}
      />
      {pkg ? (
        <Text variant="helper" color="textSecondary">
          {t('packages.form.soldNote')}
        </Text>
      ) : null}

      <Button onPress={onSubmit} loading={save.isPending} fullWidth>
        {t('packages.form.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[12] },
  half: { flexGrow: 1, flexBasis: 140 },
  block: { gap: theme.spacing[8] },
});
