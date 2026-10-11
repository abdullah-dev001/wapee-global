import { Boxes, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { SearchInput } from '@/components/shared';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Skeleton,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import {
  useDeleteProduct,
  useInventorySettings,
  useProducts,
  useSetInventorySettings,
  type ProductItem,
} from '../api/useInventory';
import { inventoryErrorKey, stockState } from '../inventoryLogic';
import { ProductForm } from './ProductForm';
import { StockPanel } from './StockPanel';

const STATE_TONE = { ok: 'success', low: 'warning', out: 'error' } as const;

/**
 * Products of the current branch (add-on "Inventory"): stock, low-stock indicator, a stock
 * panel with the immutable movement log, and the branch's "allow negative stock" switch.
 * `inventory.view` opens the screen; changing anything needs `inventory.adjust`. The route
 * wraps this in `RequireFeature`; every write is checked again by the RPC.
 */
export function InventoryScreen() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const canAdjust = usePermission('inventory.adjust', branchId);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ProductItem | null>(null);
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [deleting, setDeleting] = useState<ProductItem | null>(null);

  const list = useProducts(businessId, branchId, { search });
  const settings = useInventorySettings(businessId, branchId);
  const setSettings = useSetInventorySettings(businessId);
  const remove = useDeleteProduct(businessId);

  const all = list.data?.pages.flatMap((page) => page.rows) ?? [];
  const rows = lowOnly
    ? all.filter(
        (p) => p.isActive && p.lowStockThreshold !== null && p.stockQty <= p.lowStockThreshold,
      )
    : all;
  // The open product is read from the list so its stock stays current after a movement.
  const current = selected ? (all.find((p) => p.id === selected.id) ?? selected) : null;

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('inventory.title')}
        count={list.isSuccess ? rows.length : undefined}
        actions={
          canAdjust.allowed ? (
            <Button size="sm" startIcon={Plus} onPress={() => setCreating(true)}>
              {t('inventory.create')}
            </Button>
          ) : null
        }
      >
        <View style={styles.stack}>
          <SearchInput
            onSearch={setSearch}
            placeholder={t('inventory.searchPlaceholder')}
            accessibilityLabel={t('actions.search')}
          />
          <Toggle label={t('inventory.lowOnly')} value={lowOnly} onValueChange={setLowOnly} />

          {canAdjust.allowed && branchId ? (
            <Card>
              <View style={styles.settings}>
                <Text variant="cardTitle">{t('inventory.settings.title')}</Text>
                <Toggle
                  label={t('inventory.settings.allowNegative')}
                  value={settings.data?.allowNegativeStock ?? false}
                  disabled={settings.isPending || setSettings.isPending}
                  onValueChange={(on) =>
                    setSettings.mutate(
                      { branchId, allowNegativeStock: on },
                      {
                        onSuccess: () =>
                          toast.show({ message: t('inventory.settings.saved'), tone: 'success' }),
                        onError: (error) =>
                          toast.show({
                            message: t(inventoryErrorKey(rpcCode(error))),
                            tone: 'error',
                          }),
                      },
                    )
                  }
                />
                <Text variant="helper" color="textSecondary">
                  {t('inventory.settings.allowNegativeHint')}
                </Text>
              </View>
            </Card>
          ) : null}

          {list.isError ? (
            <ErrorState
              title={t('inventory.error.title')}
              description={list.error.message}
              onRetry={() => void list.refetch()}
              retryLabel={t('actions.retry')}
            />
          ) : list.isPending ? (
            <View style={styles.stack}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={84} />
              ))}
            </View>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title={t(
                search.length >= 2 || lowOnly
                  ? 'inventory.emptySearch.title'
                  : 'inventory.empty.title',
              )}
              description={t(
                search.length >= 2 || lowOnly
                  ? 'inventory.emptySearch.description'
                  : 'inventory.empty.description',
              )}
              action={
                canAdjust.allowed && search.length < 2 && !lowOnly
                  ? {
                      children: t('inventory.create'),
                      onPress: () => setCreating(true),
                      startIcon: Plus,
                    }
                  : undefined
              }
            />
          ) : (
            <View style={styles.stack}>
              {rows.map((product) => {
                const state = stockState(product.stockQty, product.lowStockThreshold);
                return (
                  <Pressable
                    key={product.id}
                    onPress={() => setSelected(product)}
                    accessibilityRole="button"
                    accessibilityLabel={product.name}
                  >
                    <Card>
                      <View style={styles.head}>
                        <View style={styles.headText}>
                          <Text variant="cardTitle" numberOfLines={1}>
                            {product.name}
                          </Text>
                          <Text variant="body" color="textSecondary">
                            {t('inventory.card.inStock', {
                              qty: product.stockQty,
                              unit: product.unit,
                            })}
                          </Text>
                        </View>
                        <View style={styles.right}>
                          <Text variant="bodyStrong">
                            {formatMinor(product.priceMinor, product.currency, i18n.language)}
                          </Text>
                          <Badge tone={STATE_TONE[state]}>{t(`inventory.state.${state}`)}</Badge>
                        </View>
                      </View>
                      <Text variant="helper" color="textMuted">
                        {product.sku
                          ? `${t('inventory.card.skuLabel', { sku: product.sku })} · `
                          : ''}
                        {product.lowStockThreshold !== null
                          ? t('inventory.card.level', { level: product.lowStockThreshold })
                          : t('inventory.card.noLevel')}
                        {product.isActive ? '' : ` · ${t('inventory.card.inactive')}`}
                      </Text>
                    </Card>
                  </Pressable>
                );
              })}
              {list.hasNextPage ? (
                <Button
                  variant="secondary"
                  onPress={() => void list.fetchNextPage()}
                  loading={list.isFetchingNextPage}
                >
                  {t('inventory.loadMore')}
                </Button>
              ) : null}
            </View>
          )}
        </View>
      </PageContainer>

      <Drawer open={creating} onClose={() => setCreating(false)} title={t('inventory.create')}>
        <ProductForm onDone={() => setCreating(false)} />
      </Drawer>

      <Drawer
        open={current !== null}
        onClose={() => setSelected(null)}
        title={current?.name ?? ''}
        footer={
          canAdjust.allowed && current ? (
            <View style={styles.footer}>
              <Button
                variant="secondary"
                onPress={() => {
                  setEditing(current);
                  setSelected(null);
                }}
              >
                {t('inventory.edit')}
              </Button>
              <Button
                variant="danger"
                onPress={() => {
                  setDeleting(current);
                  setSelected(null);
                }}
              >
                {t('actions.delete')}
              </Button>
            </View>
          ) : undefined
        }
      >
        {current ? <StockPanel product={current} canAdjust={canAdjust.allowed} /> : null}
      </Drawer>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing?.name ?? ''}>
        {editing ? <ProductForm product={editing} onDone={() => setEditing(null)} /> : null}
      </Drawer>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('inventory.delete.title')}
        message={t('inventory.delete.message')}
        busy={remove.isPending}
        confirm={{
          label: t('inventory.delete.confirm'),
          variant: 'danger',
          onPress: () => {
            if (!deleting) return;
            remove.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                toast.show({ message: t('inventory.form.deleted'), tone: 'success' });
              },
              onError: (error) => {
                setDeleting(null);
                toast.show({ message: t(inventoryErrorKey(rpcCode(error))), tone: 'error' });
              },
            });
          },
        }}
        cancelLabel={t('actions.cancel')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing[12],
  },
  headText: { flex: 1, gap: theme.spacing[4] },
  right: { alignItems: 'flex-end', gap: theme.spacing[4] },
  settings: { gap: theme.spacing[8] },
  footer: { flexDirection: 'row', gap: theme.spacing[8], justifyContent: 'flex-end' },
});
