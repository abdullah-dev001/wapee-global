import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { Button, Drawer, Select, useToast } from '@/components/ui';
import { allCountries, allCurrencies } from '@/config/localeData.generated';
import { findCountry, timezoneOptionsFor } from '@/config/countries';
import { useCurrentScope } from '@/lib/permissions';
import { RpcError, rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useCreateBranch, useUpdateBranch } from '../api/useBranches';
import {
  branchErrorKey,
  buildBranchPatch,
  formValuesFromBranch,
  parsePercentToBp,
  prefixLocked,
  type BranchFormValues,
  type BranchRow,
} from '../branchLogic';
import { branchFormSchema } from '../schemas/branch.schemas';

const NONE = 'none';

/** Create or edit a location: country, currency, time zone, address, tax and invoice prefix. */
export function BranchFormDrawer({
  branch,
  open,
  branches,
  onClose,
}: {
  /** The branch to edit, or null to create a new one. */
  branch: BranchRow | null;
  open: boolean;
  branches: readonly BranchRow[];
  onClose: () => void;
}) {
  if (!open) return null;
  return <Form key={branch?.id ?? 'new'} branch={branch} branches={branches} onClose={onClose} />;
}

function Form({
  branch,
  branches,
  onClose,
}: {
  branch: BranchRow | null;
  branches: readonly BranchRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId, business } = useCurrentScope();
  const create = useCreateBranch(businessId);
  const update = useUpdateBranch(businessId);

  // Pre-fill a new location from the business's defaults; a country change suggests its currency and zone.
  const primary = business?.branches.find((b) => b.is_primary);
  const defaults: BranchFormValues = branch
    ? formValuesFromBranch(branch)
    : {
        name: '',
        countryCode: primary?.country_code ?? 'GB',
        currency: primary?.currency ?? 'GBP',
        timezone: primary?.timezone ?? 'Europe/London',
        address: '',
        phone: '',
        taxNumber: '',
        taxRatePercent: '0',
        invoicePrefix: '',
      };

  const { control, handleSubmit, setValue } = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: defaults,
  });
  const countryCode = useWatch({ control, name: 'countryCode' });
  const currency = useWatch({ control, name: 'currency' });
  const timezone = useWatch({ control, name: 'timezone' });
  const copyState = useForm<{ copyFrom: string }>({ defaultValues: { copyFrom: NONE } });
  const copyFrom = useWatch({ control: copyState.control, name: 'copyFrom' });

  const countryOptions = useMemo(
    () => allCountries.map((c) => ({ value: c.code, label: c.name })),
    [],
  );
  const currencyOptions = useMemo(
    () => allCurrencies.map((c) => ({ value: c.code, label: c.code, hint: c.name })),
    [],
  );
  const timezoneOptions = useMemo(
    () => timezoneOptionsFor(countryCode).map((zone) => ({ value: zone, label: zone })),
    [countryCode],
  );
  const copyOptions = [
    { value: NONE, label: t('branches.form.copyNone') },
    ...branches.filter((b) => !b.archived).map((b) => ({ value: b.id, label: b.name })),
  ];

  const locked = branch ? prefixLocked(branch) : false;
  const saving = create.isPending || update.isPending;

  const fail = (error: Error) => {
    const code = rpcCode(error);
    const count = error instanceof RpcError ? (error.extra.count as number | undefined) : undefined;
    toast.show({ message: t(branchErrorKey(code), { count: count ?? 0 }), tone: 'error' });
  };

  const onSubmit = handleSubmit((values) => {
    if (branch) {
      const patch = buildBranchPatch(branch, values);
      if (!patch) {
        onClose();
        return;
      }
      update.mutate(
        { branchId: branch.id, patch },
        {
          onSuccess: () => {
            toast.show({ message: t('branches.saved'), tone: 'success' });
            onClose();
          },
          onError: fail,
        },
      );
      return;
    }
    create.mutate(
      {
        name: values.name.trim(),
        countryCode: values.countryCode,
        currency: values.currency,
        timezone: values.timezone,
        address: values.address.trim(),
        phone: values.phone.trim(),
        taxNumber: values.taxNumber.trim(),
        taxRateBp: parsePercentToBp(values.taxRatePercent) ?? 0,
        invoicePrefix: values.invoicePrefix.trim().toUpperCase(),
        copyFromBranchId: copyFrom === NONE ? null : copyFrom,
      },
      {
        onSuccess: (result) => {
          toast.show({ message: t('branches.created'), tone: 'success' });
          if (result.servicesSkipped > 0) {
            toast.show({
              message: t('branches.skippedPrices', { count: result.servicesSkipped }),
              tone: 'warning',
            });
          }
          onClose();
        },
        onError: fail,
      },
    );
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        branch
          ? t('branches.form.editTitle', { name: branch.name })
          : t('branches.form.createTitle')
      }
      footer={
        <Button onPress={onSubmit} loading={saving} fullWidth>
          {branch ? t('branches.form.save') : t('branches.form.create')}
        </Button>
      }
    >
      <View style={styles.form}>
        <FormField
          control={control}
          name="name"
          label={t('branches.form.name')}
          placeholder={t('branches.form.namePlaceholder')}
          required
        />
        <Select
          label={t('branches.form.country')}
          required
          options={countryOptions}
          value={countryCode}
          onChange={(value) => {
            setValue('countryCode', value, { shouldValidate: true });
            // Suggest, never force: only while the currency/zone are still the old country's defaults.
            const preset = findCountry(value);
            if (preset && !branch) {
              setValue('currency', preset.currency);
              setValue('timezone', preset.timezone);
            }
          }}
        />
        <Select
          label={t('branches.form.currency')}
          required
          options={currencyOptions}
          value={currency}
          onChange={(value) => setValue('currency', value, { shouldValidate: true })}
          hint={branch ? t('branches.form.currencyHint') : undefined}
        />
        <Select
          label={t('branches.form.timezone')}
          required
          options={timezoneOptions}
          value={timezone}
          onChange={(value) => setValue('timezone', value, { shouldValidate: true })}
          hint={branch ? t('branches.form.timezoneHint') : undefined}
        />
        <FormField control={control} name="address" label={t('branches.form.address')} />
        <FormField
          control={control}
          name="phone"
          label={t('branches.form.phone')}
          keyboardType="phone-pad"
        />
        <FormField
          control={control}
          name="taxNumber"
          label={t('branches.form.taxNumber')}
          autoCapitalize="characters"
        />
        <FormField
          control={control}
          name="taxRatePercent"
          label={t('branches.form.taxRate')}
          keyboardType="decimal-pad"
          hint={t('branches.form.taxRateHint')}
        />
        <FormField
          control={control}
          name="invoicePrefix"
          label={t('branches.form.prefix')}
          autoCapitalize="characters"
          editable={!locked}
          hint={
            locked
              ? t('branches.form.prefixLocked')
              : t('branches.form.prefixHint', {
                  example: (branch?.invoicePrefix ?? 'ABC') || 'ABC',
                })
          }
        />
        {!branch ? (
          <Select
            label={t('branches.form.copyFrom')}
            options={copyOptions}
            value={copyFrom}
            onChange={(value) => copyState.setValue('copyFrom', value)}
            hint={t('branches.form.copyHint')}
          />
        ) : null}
      </View>
    </Drawer>
  );
}

const styles = StyleSheet.create({ form: { gap: theme.spacing[16] } });
