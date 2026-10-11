import { Plus } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen, usePagePadding } from '@/components/layout';
import { Button } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { type InvoiceListFilters } from '../api/useInvoices';
import { type InvoiceStatus, type PaymentStatus } from '../types';
import { ALL_BRANCHES, InvoiceFilterBar } from './InvoiceFilterBar';
import { InvoiceDrawer, NEW_INVOICE } from './InvoiceDrawer';
import { InvoiceListView } from './InvoiceListView';

type Params = {
  search?: string;
  status?: string;
  payment?: string;
  from?: string;
  to?: string;
  clientId?: string;
  branch?: string;
  invoice?: string;
};

/**
 * Invoices: filterable, server-paginated list; the detail/editor opens in a
 * drawer (full-screen sheet on mobile) driven by `?invoice=<id>|new`, so an
 * invoice is deep-linkable and the browser back button closes it. Filters live
 * in URL params too (CLAUDE.md §6). The branch defaults to the current branch;
 * `?branch=all` widens it to every branch the caller may see.
 */
export function InvoicesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { businessId, branchId } = useCurrentScope();
  const canCreate = usePermission('invoices.create');
  const pagePadding = usePagePadding();

  const branchValue = params.branch ?? branchId ?? ALL_BRANCHES;
  const filters: InvoiceListFilters = {
    branchId: branchValue === ALL_BRANCHES ? null : branchValue,
    status: (params.status as InvoiceStatus | undefined) ?? null,
    paymentStatus: (params.payment as PaymentStatus | undefined) ?? null,
    clientId: params.clientId ?? null,
    fromDate: params.from ?? null,
    toDate: params.to ?? null,
    search: params.search ?? '',
  };
  const isFiltered = Boolean(
    filters.search ||
    filters.status ||
    filters.paymentStatus ||
    filters.clientId ||
    filters.fromDate ||
    filters.toDate,
  );

  const setFilters = (next: InvoiceListFilters) =>
    router.setParams({
      search: next.search || undefined,
      status: next.status ?? undefined,
      payment: next.paymentStatus ?? undefined,
      clientId: next.clientId ?? undefined,
      from: next.fromDate ?? undefined,
      to: next.toDate ?? undefined,
    });
  const setInvoice = (id: string | null) => router.setParams({ invoice: id ?? undefined });

  return (
    <Screen edges={['top']} scroll={false}>
      <PageContainer
        title={t('invoices.title')}
        actions={
          canCreate.allowed ? (
            <Button size="sm" startIcon={Plus} onPress={() => setInvoice(NEW_INVOICE)}>
              {t('invoices.newInvoice')}
            </Button>
          ) : null
        }
      >
        <View style={styles.filters}>
          <InvoiceFilterBar
            businessId={businessId}
            filters={filters}
            branchValue={branchValue}
            onBranchChange={(value) => router.setParams({ branch: value })}
            onChange={setFilters}
          />
        </View>
      </PageContainer>

      <View style={[styles.body, { paddingHorizontal: pagePadding }]}>
        <InvoiceListView
          businessId={businessId}
          filters={filters}
          isFiltered={isFiltered}
          onSelect={(invoice) => setInvoice(invoice.id)}
        />
      </View>

      <InvoiceDrawer
        invoiceId={params.invoice ?? null}
        onChangeInvoice={setInvoice}
        onShowClientInvoices={(clientId) => router.setParams({ clientId })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { marginTop: theme.spacing[8] },
  body: { flex: 1, marginTop: theme.spacing[12] },
});
