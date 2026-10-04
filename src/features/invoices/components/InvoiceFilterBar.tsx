import { X } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateRangePicker, SearchInput } from '@/components/shared';
import { Badge, Collapsible, Select, Text } from '@/components/ui';
import { useClient } from '@/features/clients/api/useClients';
import { useCurrentScope } from '@/lib/permissions';
import { theme, useBreakpoint } from '@/lib/theme';
import { todayInZone } from '@/lib/time';

import { type InvoiceListFilters } from '../api/useInvoices';
import { type InvoiceStatus, type PaymentStatus } from '../types';

/** Sentinel for "every branch" in the URL (`?branch=all`), distinct from "not set" which means the current branch. */
export const ALL_BRANCHES = 'all';

const PAYMENT_STATES: PaymentStatus[] = ['pending', 'partial', 'paid', 'credited'];

export type InvoiceFilterBarProps = {
  businessId: string | null;
  filters: InvoiceListFilters;
  /** The branch select's value: a branch id or `ALL_BRANCHES`. */
  branchValue: string;
  onBranchChange: (value: string) => void;
  onChange: (filters: InvoiceListFilters) => void;
};

/** Search, status, payment state, branch, date range and the client chip. Lives in the URL on web (CLAUDE.md §6). */
export function InvoiceFilterBar({
  businessId,
  filters,
  branchValue,
  onBranchChange,
  onChange,
}: InvoiceFilterBarProps) {
  const { t } = useTranslation();
  const { business } = useCurrentScope();
  const { isDesktop } = useBreakpoint();
  const branches = useMemo(() => business?.branches ?? [], [business]);
  const client = useClient(businessId, filters.clientId ?? null, false);
  const zone = branches.find((branch) => branch.id === filters.branchId)?.timezone ?? 'UTC';

  const branchOptions = useMemo(
    () => [
      { value: ALL_BRANCHES, label: t('invoices.filters.allBranches') },
      ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
    ],
    [branches, t],
  );
  const statusOptions = [
    { value: '', label: t('invoices.filters.allStatuses') },
    { value: 'draft', label: t('invoices.filters.statusDraft') },
    { value: 'issued', label: t('invoices.filters.statusIssued') },
  ];
  const paymentOptions = [
    { value: '', label: t('invoices.filters.allPayments') },
    ...PAYMENT_STATES.map((state) => ({ value: state, label: t(`invoices.state.${state}`) })),
  ];
  const hasDates = Boolean(filters.fromDate || filters.toDate);
  const anyActive = Boolean(filters.status || filters.paymentStatus || hasDates);

  return (
    <View style={styles.container}>
      <SearchInput
        onSearch={(search) => onChange({ ...filters, search })}
        initialValue={filters.search}
        placeholder={t('invoices.searchPlaceholder')}
      />

      {filters.clientId ? (
        <View style={styles.chipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('invoices.filters.clearClient')}
            onPress={() => onChange({ ...filters, clientId: null })}
            style={styles.chip}
          >
            <Badge tone="primary">
              {t('invoices.filters.showingClient', { name: client.data?.fullName ?? '…' })}
            </Badge>
            <X size={theme.iconSize.xs} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <Collapsible title={t('invoices.filters.title')} defaultOpen={isDesktop || anyActive}>
        <View style={styles.inner}>
          <View style={styles.row}>
            {branches.length > 1 ? (
              <View style={styles.field}>
                <Select
                  label={t('invoices.filters.branch')}
                  options={branchOptions}
                  value={branchValue}
                  onChange={onBranchChange}
                />
              </View>
            ) : null}
            <View style={styles.field}>
              <Select
                label={t('invoices.filters.status')}
                options={statusOptions}
                value={filters.status ?? ''}
                onChange={(value) =>
                  onChange({ ...filters, status: (value || null) as InvoiceStatus | null })
                }
              />
            </View>
            <View style={styles.field}>
              <Select
                label={t('invoices.filters.payment')}
                options={paymentOptions}
                value={filters.paymentStatus ?? ''}
                onChange={(value) =>
                  onChange({ ...filters, paymentStatus: (value || null) as PaymentStatus | null })
                }
              />
            </View>
          </View>

          <Collapsible
            title={t('invoices.filters.from') + ' – ' + t('invoices.filters.to')}
            defaultOpen={hasDates}
          >
            <DateRangePicker
              startDate={filters.fromDate ?? null}
              endDate={filters.toDate ?? null}
              startLabel={t('invoices.filters.from')}
              endLabel={t('invoices.filters.to')}
              timeZone={zone}
              maxDate={todayInZone(zone)}
              onChange={({ startDate, endDate }) =>
                onChange({ ...filters, fromDate: startDate, toDate: endDate })
              }
            />
            {hasDates ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onChange({ ...filters, fromDate: null, toDate: null })}
                style={styles.clearDates}
              >
                <Text variant="label" color="primary">
                  {t('actions.clear')}
                </Text>
              </Pressable>
            ) : null}
          </Collapsible>
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[12] },
  field: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  inner: { gap: theme.spacing[12] },
  chipRow: { flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
    minHeight: theme.layout.minTouchTarget,
  },
  clearDates: { minHeight: theme.layout.minTouchTarget, justifyContent: 'center' },
});
