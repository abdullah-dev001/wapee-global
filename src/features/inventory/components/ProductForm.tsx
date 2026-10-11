import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField, IntegerInput, MoneyInput } from '@/components/shared';
import { Button, Text, Toggle, useToast } from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useSaveProduct, type ProductItem } from '../api/useInventory';
import { inventoryErrorKey } from '../inventoryLogic';
import { emptyProduct, productSchema, type ProductValues } from '../schemas/inventory.schemas';

/** Create or edit a product of the current branch. Stock changes after creation are movements, not edits. */
export function ProductForm({
  product,
  onDone,
}: {
  /** Undefined = creating a new one. */
  product?: ProductItem;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const save = useSaveProduct(businessId);

  const currency =
    product?.currency ?? business?.branches.find((b) => b.id === branchId)?.currency ?? 'USD';

  const { control, handleSubmit, setValue } = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku ?? '',
          unit: product.unit,
          priceMinor: product.priceMinor,
          lowStockThreshold: product.lowStockThreshold,
          openingStock: 0,
          isActive: product.isActive,
        }
      : emptyProduct,
  });
  const isActive = useWatch({ control, name: 'isActive' });

  const onSubmit = handleSubmit((values) => {
    const target = product?.branchId ?? branchId;
    if (!target) return;
    save.mutate(
      { branchId: target, productId: product?.id ?? null, values },
      {
        onSuccess: () => {
          toast.show({ message: t('inventory.form.saved'), tone: 'success' });
          onDone();
        },
        onError: (error) =>
          toast.show({ message: t(inventoryErrorKey(rpcCode(error))), tone: 'error' }),
      },
    );
  });

  return (
    <View style={styles.form}>
      <Text variant="helper" color="textSecondary">
        {t('inventory.form.currencyFixed', { currency })}
      </Text>
      <FormField control={control} name="name" label={t('inventory.form.name')} required />
      <View style={styles.row}>
        <View style={styles.half}>
          <FormField
            control={control}
            name="sku"
            label={t('inventory.form.sku')}
            autoCapitalize="characters"
          />
        </View>
        <View style={styles.half}>
          <FormField
            control={control}
            name="unit"
            label={t('inventory.form.unit')}
            hint={t('inventory.form.unitHint')}
            required
          />
        </View>
      </View>
      <Controller
        control={control}
        name="priceMinor"
        render={({ field, fieldState }) => (
          <MoneyInput
            label={t('inventory.form.price')}
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
        name="lowStockThreshold"
        render={({ field, fieldState }) => (
          <IntegerInput
            label={t('inventory.form.level')}
            hint={t('inventory.form.levelHint')}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
          />
        )}
      />
      {product ? null : (
        <Controller
          control={control}
          name="openingStock"
          render={({ field, fieldState }) => (
            <IntegerInput
              label={t('inventory.form.opening')}
              hint={t('inventory.form.openingHint')}
              value={field.value}
              onChange={(v) => field.onChange(v ?? 0)}
              error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
            />
          )}
        />
      )}
      <Toggle
        label={t('inventory.form.active')}
        value={isActive}
        onValueChange={(on) => setValue('isActive', on, { shouldDirty: true })}
      />
      <Button onPress={onSubmit} loading={save.isPending} fullWidth>
        {t('inventory.form.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[12] },
  half: { flexGrow: 1, flexBasis: 140 },
});
