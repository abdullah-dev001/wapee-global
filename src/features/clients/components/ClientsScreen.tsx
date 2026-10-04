import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { SearchInput } from '@/components/shared';
import { Button, Drawer, Toggle } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { ClientForm } from './ClientForm';
import { ClientListView } from './ClientListView';

/** Replaces the Phase 4 placeholder: the client list, server-side search, create. Tapping a row opens the profile screen, not a drawer. */
export function ClientsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string; archived?: string }>();
  const { businessId } = useCurrentScope();
  const canCreate = usePermission('clients.create');

  const [creating, setCreating] = useState(false);

  const search = params.search ?? '';
  const includeArchived = params.archived === '1';

  const setSearch = (next: string) => router.setParams({ search: next || undefined });
  const setIncludeArchived = (next: boolean) =>
    router.setParams({ archived: next ? '1' : undefined });

  return (
    <Screen edges={['top']} scroll={false}>
      <PageContainer
        title={t('clients.title')}
        actions={
          canCreate.allowed ? (
            <Button size="sm" startIcon={Plus} onPress={() => setCreating(true)}>
              {t('clients.create')}
            </Button>
          ) : null
        }
      >
        <View style={styles.filters}>
          <SearchInput
            onSearch={setSearch}
            initialValue={search}
            placeholder={t('clients.searchPlaceholder')}
          />
          <View style={styles.archiveToggle}>
            <Toggle
              value={includeArchived}
              onValueChange={setIncludeArchived}
              label={t('clients.showArchived')}
            />
          </View>
        </View>
      </PageContainer>

      <View style={styles.body}>
        <ClientListView
          businessId={businessId}
          filters={{ search, includeArchived }}
          onSelect={(client) => router.push(`/clients/${client.id}`)}
        />
      </View>

      <Drawer open={creating} onClose={() => setCreating(false)} title={t('clients.create')}>
        <ClientForm
          businessId={businessId}
          onDone={() => setCreating(false)}
          onOpenExisting={(id) => {
            setCreating(false);
            router.push(`/clients/${id}`);
          }}
        />
      </Drawer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    gap: theme.spacing[12],
    marginTop: theme.spacing[8],
  },
  archiveToggle: {
    flexDirection: 'row',
  },
  body: {
    flex: 1,
    paddingHorizontal: theme.layout.pagePadding,
    marginTop: theme.spacing[12],
  },
});
