import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Lock } from 'lucide-react-native';
import { Card, EmptyState, Skeleton, Tabs, Text } from '@/components/ui';
import { usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { EarningsTab } from './EarningsTab';
import { RulesTab } from './RulesTab';
import { TeamReportTab } from './TeamReportTab';

type Tab = 'earnings' | 'report' | 'rules';

/**
 * Commission: my earnings (everyone with commission.view_own), the team report
 * (commission.view_all) and the rules (commission.manage_rules). Each tab appears
 * only for who may use it; the database filters the data the same way.
 */
export function CommissionScreen() {
  const { t } = useTranslation();
  const viewOwn = usePermission('commission.view_own');
  const viewAll = usePermission('commission.view_all');
  const manage = usePermission('commission.manage_rules');

  const tabs = useMemo(
    () =>
      [
        viewOwn.allowed
          ? { value: 'earnings' as const, label: t('commission.tabs.earnings') }
          : null,
        viewAll.allowed ? { value: 'report' as const, label: t('commission.tabs.report') } : null,
        manage.allowed ? { value: 'rules' as const, label: t('commission.tabs.rules') } : null,
      ].filter((tab) => tab !== null),
    [viewOwn.allowed, viewAll.allowed, manage.allowed, t],
  );
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab: Tab = tabs.some((item) => item.value === chosen)
    ? (chosen as Tab)
    : (tabs[0]?.value ?? 'earnings');

  if (viewOwn.isPending || viewAll.isPending || manage.isPending) {
    return (
      <Screen edges={['top']}>
        <PageContainer>
          <Skeleton height={24} width="40%" />
        </PageContainer>
      </Screen>
    );
  }
  if (tabs.length === 0) {
    return (
      <Screen edges={['top']}>
        <PageContainer fill>
          <EmptyState
            icon={Lock}
            title={t('permissions.noAccess.title')}
            description={t('permissions.noAccess.description')}
          />
        </PageContainer>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <PageContainer title={t('commission.title')} subtitle={t('commission.subtitle')}>
        <Card>
          <Text variant="cardTitle">{t('commission.rule.title')}</Text>
          <Text variant="helper" color="textSecondary">
            {t('commission.rule.body')}
          </Text>
        </Card>
        <View style={styles.body}>
          {tabs.length > 1 ? <Tabs items={tabs} value={tab} onChange={setChosen} /> : null}
          <View style={styles.content}>
            {tab === 'earnings' ? (
              <EarningsTab />
            ) : tab === 'report' ? (
              <TeamReportTab />
            ) : (
              <RulesTab />
            )}
          </View>
        </View>
      </PageContainer>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: theme.spacing[16], gap: theme.spacing[16] },
  content: { gap: theme.spacing[12] },
});
