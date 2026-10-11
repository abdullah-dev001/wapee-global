import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, ErrorState, Select, Skeleton, Text, Toggle, useToast } from '@/components/ui';
import { heldRank, scopeRank } from '@/features/roles/rolesLogic';
import { useCurrentScope, useGrantSet } from '@/lib/permissions';
import { rpcCode } from '@/lib/supabase';
import { theme } from '@/lib/theme';

import {
  useReportSchedules,
  useSetReportSchedule,
  type ReportSchedule,
} from '../api/useReportSchedules';
import { reportErrorKey } from '../reportErrors';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Weekly / monthly summary email. Everyone with advanced reports may read what is
 * scheduled only if they can manage it; changing it needs the permission for every
 * location (the database checks the same). The recipient rule is spelled out.
 */
export function ScheduleTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const { set } = useGrantSet();
  const schedules = useReportSchedules(businessId);
  const save = useSetReportSchedule(businessId);

  const canEdit =
    heldRank(set.grants, 'reports.view_advanced', set.isSuperAdmin) >= scopeRank('all');

  const row = (frequency: 'weekly' | 'monthly', title: string, hint: string) => {
    const current: ReportSchedule | undefined = (schedules.data ?? []).find(
      (s) => s.frequency === frequency && s.branchId === null,
    );
    const enabled = current?.isEnabled === true;
    const hour = current?.sendHour ?? 8;
    const update = (next: { enabled: boolean; sendHour: number }) =>
      save.mutate(
        { frequency, ...next },
        {
          onSuccess: () => toast.show({ message: t('advReports.email.saved'), tone: 'success' }),
          onError: (error) =>
            toast.show({ message: t(reportErrorKey(rpcCode(error))), tone: 'error' }),
        },
      );
    return (
      <Card key={frequency}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text variant="cardTitle">{title}</Text>
            <Text variant="helper" color="textSecondary">
              {hint}
            </Text>
          </View>
          <Toggle
            value={enabled}
            disabled={!canEdit || save.isPending}
            onValueChange={(value) => update({ enabled: value, sendHour: hour })}
            label={enabled ? t('advReports.email.hourValue', { hour }) : t('advReports.email.off')}
          />
        </View>
        {enabled ? (
          <Select
            label={t('advReports.email.hour')}
            options={HOURS.map((h) => ({
              value: String(h),
              label: t('advReports.email.hourValue', { hour: String(h).padStart(2, '0') }),
            }))}
            value={String(hour)}
            onChange={(value) => update({ enabled: true, sendHour: Number(value) })}
            disabled={!canEdit || save.isPending}
          />
        ) : null}
      </Card>
    );
  };

  return (
    <View style={styles.stack}>
      <Text variant="helper" color="textSecondary">
        {t('advReports.email.subtitle')}
      </Text>
      {schedules.isError ? (
        <ErrorState
          title={t('advReports.error.title')}
          description={schedules.error.message}
          onRetry={() => void schedules.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : schedules.isPending ? (
        <Skeleton height={96} radius="lg" />
      ) : (
        <>
          {!canEdit ? (
            <Text variant="helper" color="warning">
              {t('advReports.email.noAccess')}
            </Text>
          ) : null}
          {row('weekly', t('advReports.email.weekly'), t('advReports.email.weeklyHint'))}
          {row('monthly', t('advReports.email.monthly'), t('advReports.email.monthlyHint'))}
          <Card>
            <Text variant="cardTitle">{t('advReports.email.recipients')}</Text>
            <Text variant="helper" color="textSecondary">
              {t('advReports.email.recipientsRule')}
            </Text>
            <Text variant="helper" color="textMuted">
              {t('advReports.email.allLocations')} · {t('advReports.email.timezoneNote')}
            </Text>
            <Text variant="helper" color="textMuted">
              {t('advReports.email.summaryNote')}
            </Text>
          </Card>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[12] },
  headText: { flex: 1, gap: theme.spacing[2] },
});
