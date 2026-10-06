import { Download, FileText, Share2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, EmptyState, ErrorState, Skeleton, Text, useToast } from '@/components/ui';
import { rpcCode } from '@/lib/supabase';
import { saveTextFile } from '@/lib/files/saveTextFile';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { useAdvancedReport, type ReportQuery } from '../api/useAdvancedReport';
import { CSV_LABEL_KEYS, csvFileName, sectionCsv, type CsvLabels } from '../reportLogic';
import { type SectionKey } from '../reportTypes';
import { reportErrorKey } from '../reportErrors';
import { AppointmentsView } from './sections/AppointmentsView';
import { BranchesView } from './sections/BranchesView';
import { ClientsView } from './sections/ClientsView';
import { RevenueView } from './sections/RevenueView';
import { ServicesView } from './sections/ServicesView';
import { StaffView } from './sections/StaffView';

const CSV_KEYS = {
  currency: 'advReports.csv.currency',
  invoices: 'advReports.csv.invoices',
  invoiced: 'advReports.csv.invoiced',
  credited: 'advReports.csv.credited',
  tax: 'advReports.csv.tax',
  net: 'advReports.csv.net',
  previousNet: 'advReports.csv.previousNet',
  collected: 'advReports.csv.collected',
  previousCollected: 'advReports.csv.previousCollected',
  discounts: 'advReports.csv.discounts',
  date: 'advReports.csv.date',
  method: 'advReports.csv.method',
  amount: 'advReports.csv.amount',
  metric: 'advReports.csv.metric',
  current: 'advReports.csv.current',
  previous: 'advReports.csv.previous',
  currentRate: 'advReports.csv.currentRate',
  previousRate: 'advReports.csv.previousRate',
  total: 'advReports.csv.total',
  completed: 'advReports.csv.completed',
  cancelled: 'advReports.csv.cancelled',
  noShow: 'advReports.csv.noShow',
  staff: 'advReports.csv.staff',
  appointments: 'advReports.csv.appointments',
  commission: 'advReports.csv.commission',
  service: 'advReports.csv.service',
  booked: 'advReports.csv.booked',
  quantity: 'advReports.csv.quantity',
  active: 'advReports.csv.active',
  newClients: 'advReports.csv.newClients',
  returningClients: 'advReports.csv.returningClients',
  retention: 'advReports.csv.retention',
  branch: 'advReports.csv.branch',
} as const satisfies Record<(typeof CSV_LABEL_KEYS)[number], `advReports.csv.${string}`>;

/** One section for the chosen period, with its previous-period comparison and export. */
export function SectionPanel({
  businessId,
  branchId,
  section,
  query,
  forPrint = false,
}: {
  businessId: string | null;
  branchId: string | null;
  section: SectionKey;
  query: Omit<ReportQuery, 'section'>;
  forPrint?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const report = useAdvancedReport(businessId, branchId, { ...query, section });

  if (report.isError) {
    return (
      <ErrorState
        title={t('advReports.error.title')}
        description={t(reportErrorKey(rpcCode(report.error)))}
        onRetry={() => void report.refetch()}
        retryLabel={t('actions.retry')}
      />
    );
  }
  if (report.isPending) {
    return (
      <View style={styles.stack}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={110} radius="lg" />
        ))}
      </View>
    );
  }

  const { period, current, previous } = report.data;
  const labels = Object.fromEntries(
    CSV_LABEL_KEYS.map((key) => [key, t(CSV_KEYS[key])]),
  ) as CsvLabels;
  const rangeLabel = (from: string, to: string) =>
    t('advReports.range', {
      from: formatDate(`${from}T12:00:00Z` as UtcIso, 'UTC', i18n.language, 'medium'),
      to: formatDate(`${to}T12:00:00Z` as UtcIso, 'UTC', i18n.language, 'medium'),
    });

  const exportCsv = async () => {
    const csv = sectionCsv(section, current as never, previous as never, labels);
    const result = await saveTextFile(csvFileName(section, period.from, period.to), csv);
    if (result !== 'cancelled') {
      toast.show({
        message: t(
          result === 'downloaded' ? 'advReports.export.downloaded' : 'advReports.export.shared',
        ),
        tone: 'success',
      });
    }
  };

  const empty =
    (section === 'revenue' && (current as { currencies: unknown[] }).currencies.length === 0) ||
    (section === 'appointments' &&
      (current as { total: number }).total === 0 &&
      (previous as { total: number }).total === 0) ||
    (section === 'branches' && (current as { branches: unknown[] }).branches.length === 0);

  return (
    <View style={styles.stack}>
      <Text variant="helper" color="textSecondary">
        {rangeLabel(period.from, period.to)} ·{' '}
        {t('advReports.previousRange', {
          from: formatDate(
            `${period.prevFrom}T12:00:00Z` as UtcIso,
            'UTC',
            i18n.language,
            'medium',
          ),
          to: formatDate(`${period.prevTo}T12:00:00Z` as UtcIso, 'UTC', i18n.language, 'medium'),
        })}
      </Text>
      {section === 'revenue' ||
      section === 'staff' ||
      section === 'services' ||
      section === 'branches' ? (
        <Text variant="helper" color="textMuted">
          {t('advReports.currencyNote')}
        </Text>
      ) : null}

      {empty ? (
        <EmptyState
          compact
          title={t('advReports.empty.title')}
          description={t('advReports.empty.description')}
        />
      ) : section === 'revenue' ? (
        <RevenueView current={current as never} previous={previous as never} />
      ) : section === 'staff' ? (
        <StaffView current={current as never} previous={previous as never} />
      ) : section === 'services' ? (
        <ServicesView current={current as never} />
      ) : section === 'clients' ? (
        <ClientsView current={current as never} previous={previous as never} />
      ) : section === 'appointments' ? (
        <AppointmentsView current={current as never} previous={previous as never} />
      ) : (
        <BranchesView current={current as never} previous={previous as never} />
      )}

      {forPrint ? null : (
        <View style={styles.exports}>
          <Button
            variant="secondary"
            size="sm"
            startIcon={Platform.OS === 'web' ? Download : Share2}
            onPress={() => void exportCsv()}
          >
            {Platform.OS === 'web' ? t('advReports.export.csv') : t('advReports.export.shareCsv')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            startIcon={FileText}
            onPress={() => {
              const params = new URLSearchParams({
                section,
                kind: query.kind,
                anchor: query.anchor,
              });
              if (query.from) params.set('from', query.from);
              if (query.to) params.set('to', query.to);
              if (branchId) params.set('branch', branchId);
              router.push(`/report-print?${params.toString()}` as never);
            }}
          >
            {t('advReports.export.print')}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  exports: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
});
