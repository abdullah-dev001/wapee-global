import { Receipt } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { focusRing, theme } from '@/lib/theme';

import { useInvoiceList } from '../api/useInvoices';
import { formatInvoiceDate, formatMinor } from '../format';
import { type InvoiceListRow } from '../types';
import { InvoiceDrawer } from './InvoiceDrawer';
import { InvoiceStateBadge } from './InvoiceStateBadge';

/**
 * The invoices of ONE client on the client profile: number, date, total in the invoice's own currency (currencies
 * are never added together), payment state. Server-side paginated (20 per page); a row opens the invoice drawer.
 * Hidden without `invoices.view` (the database filters the rows by the same permission).
 */
export function ClientInvoicesSection({
  businessId,
  clientId,
}: {
  businessId: string | null;
  clientId: string;
}) {
  const { t, i18n } = useTranslation();
  const { business } = useCurrentScope();
  const canView = usePermission('invoices.view');
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useInvoiceList(canView.allowed ? businessId : null, { clientId });

  if (!canView.allowed) return null;

  const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];
  const zoneOf = (branchId: string) =>
    business?.branches.find((branch) => branch.id === branchId)?.timezone ?? 'UTC';

  return (
    <View style={styles.section}>
      <Text variant="sectionTitle">{t('clients.profile.invoices')}</Text>
      {query.isError ? (
        <Card>
          <ErrorState
            compact
            title={t('invoices.error.title')}
            onRetry={() => void query.refetch()}
            retryLabel={t('actions.retry')}
          />
        </Card>
      ) : query.isPending ? (
        <Card noPadding>
          {[0, 1].map((row) => (
            <View key={row} style={styles.skeletonRow}>
              <Skeleton height={16} width="40%" radius="sm" />
              <Skeleton height={12} width="60%" radius="sm" />
            </View>
          ))}
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState compact icon={Receipt} title={t('clients.profile.invoicesEmpty')} />
        </Card>
      ) : (
        <Card noPadding>
          {rows.map((row) => (
            <InvoiceRow
              key={row.id}
              row={row}
              date={formatInvoiceDate(
                row.issuedAt ?? row.createdAt,
                zoneOf(row.branchId),
                i18n.language,
              )}
              total={formatMinor(row.totalMinor, row.currency, i18n.language)}
              number={row.number ?? t('invoices.noNumber')}
              onPress={() => setOpenId(row.id)}
            />
          ))}
        </Card>
      )}
      {query.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        >
          {t('invoices.loadMore')}
        </Button>
      ) : null}
      <InvoiceDrawer invoiceId={openId} onChangeInvoice={setOpenId} />
    </View>
  );
}

function InvoiceRow({
  row,
  date,
  total,
  number,
  onPress,
}: {
  row: InvoiceListRow;
  date: string;
  total: string;
  number: string;
  onPress: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, showHover ? { opacity: 0.8 } : null, showFocusRing ? focusRing() : null]}
    >
      <View style={styles.rowTop}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
          {number}
        </Text>
        <Text variant="bodyStrong">{total}</Text>
      </View>
      <View style={styles.rowTop}>
        <Text variant="helper" color="textSecondary">
          {date}
        </Text>
        <InvoiceStateBadge status={row.status} paymentStatus={row.paymentStatus} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing[8] },
  skeletonRow: { gap: theme.spacing[6], padding: theme.spacing[16] },
  row: {
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    minHeight: theme.layout.minTouchTarget,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  rowTitle: { flexShrink: 1 },
});
