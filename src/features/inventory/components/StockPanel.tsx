import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField, IntegerInput } from '@/components/shared';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  SegmentedControl,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { formatDateTime, type IanaTimeZone, type LocaleTag, type UtcIso } from '@/lib/time';

import {
  useAdjustStock,
  useStockMovements,
  type ProductItem,
  type StockMovementItem,
} from '../api/useInventory';
import {
  inventoryErrorKey,
  manualQuantity,
  signedQuantity,
  stockState,
  type MovementKind,
} from '../inventoryLogic';
import { stockMovementSchema, type StockMovementValues } from '../schemas/inventory.schemas';

const STATE_TONE = { ok: 'success', low: 'warning', out: 'error' } as const;

/** Current stock, the form to record a manual movement, and the immutable history. */
export function StockPanel({ product, canAdjust }: { product: ProductItem; canAdjust: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId, business } = useCurrentScope();
  const adjust = useAdjustStock(businessId);
  const log = useStockMovements(businessId, product.id);
  const rows = log.data?.pages.flatMap((page) => page.rows) ?? [];
  const timeZone = (business?.branches.find((b) => b.id === (product.branchId ?? branchId))
    ?.timezone ?? 'UTC') as IanaTimeZone;

  const { control, handleSubmit, reset } = useForm<StockMovementValues>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: { kind: 'purchase', direction: 'in', quantity: 1, reason: '' },
  });
  const kind = useWatch({ control, name: 'kind' });

  const onSubmit = handleSubmit((values) => {
    const signed = manualQuantity(values.kind, values.quantity, values.direction);
    adjust.mutate(
      { productId: product.id, kind: values.kind, quantity: signed, reason: values.reason },
      {
        onSuccess: () => {
          toast.show({ message: t('inventory.stock.recorded'), tone: 'success' });
          reset({ kind: 'purchase', direction: 'in', quantity: 1, reason: '' });
        },
        onError: (error) =>
          toast.show({ message: t(inventoryErrorKey(rpcCode(error))), tone: 'error' }),
      },
    );
  });

  const state = stockState(product.stockQty, product.lowStockThreshold);

  return (
    <View style={styles.stack}>
      <Card>
        <View style={styles.head}>
          <Text variant="cardTitle">
            {t('inventory.stock.current', { qty: product.stockQty, unit: product.unit })}
          </Text>
          <Badge tone={STATE_TONE[state]}>{t(`inventory.state.${state}`)}</Badge>
        </View>
      </Card>

      {canAdjust ? (
        <View style={styles.stack}>
          <Text variant="sectionTitle">{t('inventory.stock.move')}</Text>
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <SegmentedControl<StockMovementValues['kind']>
                label={t('inventory.stock.kind')}
                options={[
                  { value: 'purchase', label: t('inventory.stock.kindPurchase') },
                  { value: 'adjustment', label: t('inventory.stock.kindAdjustment') },
                  { value: 'return', label: t('inventory.stock.kindReturn') },
                ]}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {kind === 'adjustment' ? (
            <Controller
              control={control}
              name="direction"
              render={({ field }) => (
                <SegmentedControl<StockMovementValues['direction']>
                  label={t('inventory.stock.direction')}
                  options={[
                    { value: 'in', label: t('inventory.stock.directionIn') },
                    { value: 'out', label: t('inventory.stock.directionOut') },
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          ) : null}
          <Controller
            control={control}
            name="quantity"
            render={({ field, fieldState }) => (
              <IntegerInput
                label={t('inventory.stock.quantity')}
                value={field.value}
                onChange={(v) => field.onChange(v ?? 0)}
                error={fieldState.error?.message ? t(fieldState.error.message as never) : undefined}
              />
            )}
          />
          <FormField
            control={control}
            name="reason"
            label={t(
              kind === 'purchase' ? 'inventory.stock.reasonOptional' : 'inventory.stock.reason',
            )}
          />
          <Button onPress={onSubmit} loading={adjust.isPending} fullWidth>
            {t('inventory.stock.apply')}
          </Button>
        </View>
      ) : null}

      <Text variant="sectionTitle">{t('inventory.stock.log')}</Text>
      {log.isError ? (
        <ErrorState
          title={t('inventory.stock.logError')}
          description={log.error.message}
          onRetry={() => void log.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : log.isPending ? (
        <Skeleton height={56} />
      ) : rows.length === 0 ? (
        <Text variant="body" color="textMuted">
          {t('inventory.stock.logEmpty')}
        </Text>
      ) : (
        <View style={styles.stack}>
          {rows.map((row) => (
            <MovementRow
              key={row.id}
              row={row}
              locale={i18n.language as LocaleTag}
              timeZone={timeZone}
            />
          ))}
          {log.hasNextPage ? (
            <Button
              variant="secondary"
              onPress={() => void log.fetchNextPage()}
              loading={log.isFetchingNextPage}
            >
              {t('inventory.loadMore')}
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

function MovementRow({
  row,
  locale,
  timeZone,
}: {
  row: StockMovementItem;
  locale: LocaleTag;
  timeZone: IanaTimeZone;
}) {
  const { t } = useTranslation();
  const kind: MovementKind = row.kind;
  return (
    <Card>
      <View style={styles.head}>
        <Text variant="bodyStrong">
          {t(`inventory.stock.kind_${kind}`)} {signedQuantity(row.quantity)}
        </Text>
        <Text variant="helper" color="textSecondary">
          {t('inventory.stock.afterStock', { qty: row.stockAfter })}
        </Text>
      </View>
      <Text variant="helper" color="textMuted">
        {formatDateTime(row.createdAt as UtcIso, timeZone, locale, 'medium')}
        {row.reason ? ` · ${row.reason}` : ''}
        {row.invoiceId ? ` · ${t('inventory.stock.invoice')}` : ''}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
});
