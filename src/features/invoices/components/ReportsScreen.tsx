import { BarChart3, ChartNoAxesCombined } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Button, Card, EmptyState, ErrorState, Skeleton, Tabs, Text } from '@/components/ui';
import { useCurrentScope, useFeatureFlag, usePermission } from '@/lib/permissions';
import { theme, useBreakpoint } from '@/lib/theme';

import {
  useBasicReport,
  type PeriodReport,
  type ReportPeriod,
  type RevenueRow,
} from '../api/useReport';
import { formatMinor } from '../format';
import { barPercent, sortByCurrency, statusCountRows } from '../invoiceLogic';
import { invoiceErrorKey } from '../invoiceErrorKey';

/**
 * Today and This month, from `get_basic_report` (each branch in its OWN
 * timezone). Revenue appears only with `reports.view_revenue` (the server
 * returns null otherwise) and is ALWAYS one block per currency: amounts in
 * different currencies are never added together.
 */
export function ReportsScreen() {
  const { t } = useTranslation();
  const { businessId, branchId } = useCurrentScope();
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const report = useBasicReport(businessId, branchId);
  const router = useRouter();
  const advanced = usePermission('reports.view_advanced');
  const advancedPlan = useFeatureFlag('advanced_reports');

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('reports.title')}
        actions={
          advanced.allowed && advancedPlan.enabled ? (
            <Button
              size="sm"
              variant="secondary"
              startIcon={ChartNoAxesCombined}
              onPress={() => router.push('/settings/advanced-reports')}
            >
              {t('advReports.openFromReports')}
            </Button>
          ) : null
        }
      >
        <View style={styles.tabs}>
          <Tabs
            items={[
              { value: 'today', label: t('reports.tabs.today') },
              { value: 'month', label: t('reports.tabs.month') },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </View>
        <Text variant="helper" color="textSecondary">
          {period === 'today' ? t('reports.summary.todayFor') : t('reports.summary.monthFor')}
        </Text>

        <View style={styles.body}>
          {report.isError ? (
            <ErrorState
              title={t('reports.error.title')}
              description={t(invoiceErrorKey(report.error))}
              onRetry={() => void report.refetch()}
              retryLabel={t('actions.retry')}
            />
          ) : report.isPending ? (
            <View style={styles.skeleton}>
              <Skeleton height={140} radius="lg" />
              <Skeleton height={140} radius="lg" />
              <Skeleton height={140} radius="lg" />
            </View>
          ) : (
            <PeriodView data={report.data[period]} />
          )}
        </View>
      </PageContainer>
    </Screen>
  );
}

function PeriodView({ data }: { data: PeriodReport }) {
  const { t, i18n } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const revenue = data.revenue ? sortByCurrency(data.revenue) : null;

  return (
    <View style={styles.sections}>
      {revenue ? (
        <View style={styles.section}>
          <Text variant="sectionTitle">{t('reports.revenue.title')}</Text>
          {revenue.length === 0 ? (
            <Card>
              <Text variant="body" color="textMuted">
                {t('reports.revenue.empty')}
              </Text>
            </Card>
          ) : (
            <View style={[styles.grid, isDesktop ? styles.gridWide : null]}>
              {revenue.map((row) => (
                <RevenueCard key={row.currency} row={row} locale={i18n.language} wide={isDesktop} />
              ))}
            </View>
          )}
          {revenue.length > 1 ? (
            <Text variant="caption" color="textMuted">
              {t('reports.revenue.currencyNote')}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.grid, isDesktop ? styles.gridWide : null]}>
        {data.appointments ? (
          <Card style={[styles.half, isDesktop ? styles.cardWide : null]}>
            <Text variant="sectionTitle">{t('reports.appointments.title')}</Text>
            <Text variant="statValue">{data.appointments.total ?? 0}</Text>
            {(data.appointments.total ?? 0) === 0 ? (
              <Text variant="helper" color="textMuted">
                {t('reports.appointments.empty')}
              </Text>
            ) : (
              <View style={styles.statusList}>
                {statusCountRows(data.appointments).map((row) => (
                  <View key={row.status} style={styles.statusRow}>
                    <Text variant="body" color="textSecondary" style={styles.statusLabel}>
                      {t(`appointments.status.${row.status}`)}
                    </Text>
                    <Text variant="bodyStrong">{row.count}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        ) : null}

        {data.topServices ? (
          <Card style={[styles.half, isDesktop ? styles.cardWide : null]}>
            <Text variant="sectionTitle">{t('reports.topServices.title')}</Text>
            {data.topServices.length === 0 ? (
              <Text variant="helper" color="textMuted">
                {t('reports.topServices.empty')}
              </Text>
            ) : (
              <View style={styles.statusList}>
                {data.topServices.map((service, _i, all) => {
                  const max = Math.max(...all.map((s) => s.completedAppointments));
                  return (
                    <View key={service.serviceId} style={styles.topRow}>
                      <View style={styles.statusRow}>
                        <Text variant="bodyStrong" numberOfLines={1} style={styles.statusLabel}>
                          {service.name}
                        </Text>
                        <Text variant="body" color="textSecondary">
                          {t('reports.topServices.completed', {
                            count: service.completedAppointments,
                          })}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${barPercent(service.completedAppointments, max)}%` },
                          ]}
                        />
                      </View>
                      {service.revenue && service.revenue.length > 0 ? (
                        <Text variant="caption" color="textSecondary">
                          {sortByCurrency(service.revenue)
                            .map((r) => formatMinor(r.netMinor, r.currency, i18n.language))
                            .join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        ) : null}
      </View>

      {!data.revenue && !data.appointments ? (
        <EmptyState icon={BarChart3} title={t('reports.noAccess')} />
      ) : null}
    </View>
  );
}

function RevenueCard({ row, locale, wide }: { row: RevenueRow; locale: string; wide: boolean }) {
  const { t } = useTranslation();
  const money = (minor: number) => formatMinor(minor, row.currency, locale);
  return (
    <Card style={[styles.revenueCard, wide ? styles.cardWide : null]}>
      <Text variant="label" color="textSecondary">
        {row.currency} · {t('reports.revenue.net')}
      </Text>
      <Text variant="statValue">{money(row.netRevenueMinor)}</Text>
      <Text variant="caption" color="textMuted">
        {t('reports.revenue.invoiceCount', { count: row.invoiceCount })}
      </Text>
      <View style={styles.statusList}>
        <Line label={t('reports.revenue.invoiced')} value={money(row.invoicedMinor)} />
        <Line label={t('reports.revenue.tax')} value={money(row.taxMinor)} />
        <Line label={t('reports.revenue.credited')} value={'−' + money(row.creditedMinor)} />
        <Line strong label={t('reports.revenue.collected')} value={money(row.collectedMinor)} />
      </View>
    </Card>
  );
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.statusRow}>
      <Text
        variant={strong ? 'bodyStrong' : 'body'}
        color={strong ? 'textPrimary' : 'textSecondary'}
        style={styles.statusLabel}
      >
        {label}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'body'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { marginTop: theme.spacing[8] },
  body: { marginTop: theme.spacing[16] },
  skeleton: { gap: theme.spacing[12] },
  sections: { gap: theme.spacing[20] },
  section: { gap: theme.spacing[8] },
  grid: { gap: theme.spacing[12] },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  half: { gap: theme.spacing[8] },
  cardWide: { flexGrow: 1, flexBasis: 320 },
  revenueCard: { gap: theme.spacing[4] },
  statusList: { gap: theme.spacing[8], marginTop: theme.spacing[8] },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  statusLabel: { flexShrink: 1 },
  topRow: { gap: theme.spacing[4] },
  barTrack: {
    height: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceHover,
  },
  barFill: { height: 6, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary },
});
