import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Tabs } from '@/components/ui';
import { useMyBranches } from '@/features/branches/api/useBranches';
import { useCurrentScope, useFeatureFlag, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { todayInZone } from '@/lib/time';

import { resolvePeriod } from '../periodLogic';
import { type SectionKey } from '../reportTypes';
import { ReportControls, type ControlsState } from './ReportControls';
import { ScheduleTab } from './ScheduleTab';
import { SectionPanel } from './SectionPanel';

type Tab = SectionKey | 'email';

/**
 * Advanced reports: pick a week, a month or a custom range, and every section
 * shows that period against the one before it. Sections follow what the person may
 * see (revenue needs reports.view_revenue; location comparison needs the Business
 * plan). The server filters the figures the same way.
 */
export function AdvancedReportsScreen() {
  const { t } = useTranslation();
  const { businessId, business } = useCurrentScope();
  const zone = business?.branches.find((b) => b.is_primary)?.timezone ?? 'UTC';
  const revenue = usePermission('reports.view_revenue');
  const comparison = useFeatureFlag('branch_comparison');
  const mine = useMyBranches(businessId);
  const live = useMemo(() => (mine.data?.branches ?? []).filter((b) => !b.archived), [mine.data]);

  const [controls, setControls] = useState<ControlsState>(() => {
    const today = todayInZone(zone);
    return {
      kind: 'monthly',
      anchor: today,
      customFrom: today,
      customTo: today,
      applied: null,
      branchId: null,
    };
  });
  const [tab, setTab] = useState<Tab>(revenue.allowed ? 'revenue' : 'appointments');

  const tabs = useMemo(
    () =>
      [
        revenue.allowed
          ? { value: 'revenue' as const, label: t('advReports.sections.revenue') }
          : null,
        { value: 'staff' as const, label: t('advReports.sections.staff') },
        { value: 'services' as const, label: t('advReports.sections.services') },
        { value: 'clients' as const, label: t('advReports.sections.clients') },
        { value: 'appointments' as const, label: t('advReports.sections.appointments') },
        comparison.enabled && live.length > 1
          ? { value: 'branches' as const, label: t('advReports.sections.branches') }
          : null,
        { value: 'email' as const, label: t('advReports.sections.email') },
      ].filter((item) => item !== null),
    [revenue.allowed, comparison.enabled, live.length, t],
  );
  const active: Tab = tabs.some((item) => item.value === tab)
    ? tab
    : (tabs[0]?.value ?? 'appointments');

  const period = resolvePeriod(controls.kind, controls.anchor, controls.applied ?? undefined);
  const query = {
    kind: controls.kind,
    anchor: controls.anchor,
    ...(controls.kind === 'custom' && controls.applied
      ? { from: controls.applied.from, to: controls.applied.to }
      : {}),
  };

  return (
    <Screen edges={['top']}>
      <PageContainer title={t('advReports.title')} subtitle={t('advReports.subtitle')}>
        <View style={styles.stack}>
          <ReportControls state={controls} onChange={setControls} branches={live} />
          <Tabs items={tabs} value={active} onChange={setTab} />
          {active === 'email' ? (
            <ScheduleTab />
          ) : controls.kind === 'custom' && !period ? null : (
            <SectionPanel
              key={`${active}:${controls.kind}:${controls.anchor}:${controls.applied?.from ?? ''}:${controls.applied?.to ?? ''}:${controls.branchId ?? ''}`}
              businessId={businessId}
              branchId={controls.branchId}
              section={active}
              query={query}
            />
          )}
        </View>
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: theme.spacing[16] } });
