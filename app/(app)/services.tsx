import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { SearchInput } from '@/components/shared';
import { Button, Dialog, Drawer, ErrorState } from '@/components/ui';
import { RouteGuard } from '@/features/auth';
import {
  useDeleteService,
  useServices,
  type ServiceListItem,
} from '@/features/services/api/useServices';
import { ServiceForm } from '@/features/services/components/ServiceForm';
import { ServiceList } from '@/features/services/components/ServiceList';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

/**
 * The service catalogue. Price shown is the one at the current branch
 * (decision 23); the currency comes from that branch, never the business.
 */
export default function ServicesScreen() {
  const { t } = useTranslation();
  const { businessId, branchId, business } = useCurrentScope();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ServiceListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ServiceListItem | null>(null);

  const services = useServices(businessId, branchId, { search });
  const canManage = usePermission('services.manage');
  const remove = useDeleteService(businessId);

  const branch = business?.branches.find((entry) => entry.id === branchId);
  const currency = branch?.currency ?? 'USD';

  return (
    <RouteGuard>
      <Screen edges={['top']}>
        <PageContainer
          title={t('services.title')}
          count={services.data?.length}
          actions={
            canManage.allowed ? (
              <Button size="sm" startIcon={Plus} onPress={() => setCreating(true)}>
                {t('services.create')}
              </Button>
            ) : null
          }
        >
          <View style={{ gap: theme.spacing[16] }}>
            <SearchInput
              onSearch={setSearch}
              placeholder={t('services.title')}
              accessibilityLabel={t('actions.search')}
            />

            {services.isError ? (
              <ErrorState
                title={t('services.error.title')}
                description={services.error.message}
                onRetry={() => void services.refetch()}
                retryLabel={t('actions.retry')}
              />
            ) : (
              <ServiceList
                services={services.data ?? []}
                isPending={services.isPending}
                isSearching={search.length > 0}
                currency={currency}
                onSelect={canManage.allowed ? setEditing : undefined}
              />
            )}
          </View>
        </PageContainer>

        <Drawer open={creating} onClose={() => setCreating(false)} title={t('services.create')}>
          <ServiceForm onDone={() => setCreating(false)} />
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
          {editing ? <ServiceForm service={editing} onDone={() => setEditing(null)} /> : null}
        </Drawer>

        <Dialog
          open={deleting !== null}
          onClose={() => setDeleting(null)}
          title={t('services.deleteConfirm.title')}
          message={t('services.deleteConfirm.message')}
          busy={remove.isPending}
          confirm={{
            label: t('services.deleteConfirm.confirm'),
            variant: 'danger',
            onPress: () => {
              if (!deleting) return;
              remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
            },
          }}
          cancelLabel={t('actions.cancel')}
        />
      </Screen>
    </RouteGuard>
  );
}
