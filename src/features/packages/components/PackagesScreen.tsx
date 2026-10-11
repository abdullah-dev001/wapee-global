import { Package, Plus } from 'lucide-react-native';
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
  useToast,
} from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import { useDeletePackage, usePackages, type PackageListItem } from '../api/usePackages';
import { packageErrorKey } from '../packageLogic';
import { PackageForm } from './PackageForm';

/**
 * The package catalogue of the current branch (add-on "Packages & Sessions"). Anyone who can
 * sell packages sees the list; creating and editing needs `services.manage`. The route wraps
 * this in `RequireFeature`, and every write is checked again by the RPC.
 */
export function PackagesScreen() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { businessId, branchId } = useCurrentScope();
  const canManage = usePermission('services.manage', branchId);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PackageListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PackageListItem | null>(null);

  const list = usePackages(businessId, branchId, { search });
  const remove = useDeletePackage(businessId);
  const rows = list.data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('packages.title')}
        count={list.isSuccess ? rows.length : undefined}
        actions={
          canManage.allowed ? (
            <Button size="sm" startIcon={Plus} onPress={() => setCreating(true)}>
              {t('packages.create')}
            </Button>
          ) : null
        }
      >
        <View style={styles.stack}>
          <SearchInput
            onSearch={setSearch}
            placeholder={t('packages.searchPlaceholder')}
            accessibilityLabel={t('actions.search')}
          />

          {list.isError ? (
            <ErrorState
              title={t('packages.error.title')}
              description={list.error.message}
              onRetry={() => void list.refetch()}
              retryLabel={t('actions.retry')}
            />
          ) : list.isPending ? (
            <View style={styles.stack}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={92} />
              ))}
            </View>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t(search.length >= 2 ? 'packages.emptySearch.title' : 'packages.empty.title')}
              description={t(
                search.length >= 2
                  ? 'packages.emptySearch.description'
                  : 'packages.empty.description',
              )}
              action={
                canManage.allowed && search.length < 2
                  ? {
                      children: t('packages.create'),
                      onPress: () => setCreating(true),
                      startIcon: Plus,
                    }
                  : undefined
              }
            />
          ) : (
            <View style={styles.stack}>
              {rows.map((pkg) => (
                <Pressable
                  key={pkg.id}
                  disabled={!canManage.allowed}
                  onPress={() => setEditing(pkg)}
                  accessibilityRole={canManage.allowed ? 'button' : undefined}
                  accessibilityLabel={pkg.name}
                >
                  <Card>
                    <View style={styles.head}>
                      <View style={styles.headText}>
                        <Text variant="cardTitle" numberOfLines={1}>
                          {pkg.name}
                        </Text>
                        <Text variant="body" color="textSecondary">
                          {t('packages.card.sessions', { count: pkg.sessions })}
                          {pkg.bonusSessions > 0
                            ? ` ${t('packages.card.bonus', { count: pkg.bonusSessions })}`
                            : ''}
                        </Text>
                      </View>
                      <Text variant="bodyStrong">
                        {formatMinor(pkg.priceMinor, pkg.currency, i18n.language)}
                      </Text>
                    </View>
                    <View style={styles.meta}>
                      <Text variant="helper" color="textMuted">
                        {pkg.expiryDays
                          ? t('packages.card.expires', { days: pkg.expiryDays })
                          : t('packages.card.noExpiry')}
                        {' · '}
                        {t('packages.card.services', { count: pkg.serviceIds.length })}
                      </Text>
                      {!pkg.isActive ? (
                        <Badge tone="neutral">{t('packages.card.inactive')}</Badge>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              ))}
              {list.hasNextPage ? (
                <Button
                  variant="secondary"
                  onPress={() => void list.fetchNextPage()}
                  loading={list.isFetchingNextPage}
                >
                  {t('packages.loadMore')}
                </Button>
              ) : null}
            </View>
          )}
        </View>
      </PageContainer>

      <Drawer open={creating} onClose={() => setCreating(false)} title={t('packages.create')}>
        <PackageForm onDone={() => setCreating(false)} />
      </Drawer>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ''}
        footer={
          <Button
            variant="danger"
            fullWidth
            onPress={() => {
              const target = editing;
              setEditing(null);
              setDeleting(target);
            }}
          >
            {t('actions.delete')}
          </Button>
        }
      >
        {editing ? <PackageForm pkg={editing} onDone={() => setEditing(null)} /> : null}
      </Drawer>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('packages.delete.title')}
        message={t('packages.delete.message')}
        busy={remove.isPending}
        confirm={{
          label: t('packages.delete.confirm'),
          variant: 'danger',
          onPress: () => {
            if (!deleting) return;
            remove.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                toast.show({ message: t('packages.form.deleted'), tone: 'success' });
              },
              onError: (error) => {
                setDeleting(null);
                toast.show({ message: t(packageErrorKey(rpcCode(error))), tone: 'error' });
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
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
});
