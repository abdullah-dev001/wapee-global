import { Percent } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Collapsible,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  Text,
} from '@/components/ui';
import { bpToPercentText } from '@/features/branches/branchLogic';
import { formatMinor } from '@/features/invoices/format';
import { useServices } from '@/features/services/api/useServices';
import { useStaff } from '@/features/staff/api/useStaff';
import { useCurrentScope } from '@/lib/permissions';
import { formatDate, todayInZone, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useCommissionRules } from '../api/useCommission';
import { currentRule, upcomingRule, type CommissionRule } from '../commissionLogic';
import { RuleDrawer } from './RuleDrawer';

type Editing = { serviceId: string | null; targetName: string } | null;

/** Per team member: the default rule and one row per service, with history. */
export function RulesTab() {
  const { t, i18n } = useTranslation();
  const { businessId, business } = useCurrentScope();
  const zone = business?.branches.find((b) => b.is_primary)?.timezone ?? 'UTC';
  const today = todayInZone(zone);

  const staff = useStaff(businessId, null, { includeInactive: false });
  const services = useServices(businessId, null, { includeInactive: false });
  const [staffId, setStaffId] = useState<string | null>(null);
  const rules = useCommissionRules(businessId, staffId);
  const [editing, setEditing] = useState<Editing>(null);

  const describe = (rule: CommissionRule | null): string => {
    if (!rule) return t('commission.rules.usesDefault');
    if (rule.kind === 'percent')
      return t('commission.rules.percent', { value: bpToPercentText(rule.percentBp ?? 0) });
    if (rule.kind === 'flat')
      return t('commission.rules.flat', {
        value: formatMinor(rule.flatMinor ?? 0, rule.currency ?? '', i18n.language),
      });
    return t('commission.rules.none');
  };

  const list = rules.data ?? [];
  const selected = (staff.data ?? []).find((s) => s.id === staffId);

  const row = (serviceId: string | null, name: string) => {
    const now = currentRule(list, serviceId, today);
    const next = upcomingRule(list, serviceId, today);
    return (
      <Card key={serviceId ?? 'default'}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text variant="cardTitle" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="body" color={now || serviceId === null ? 'textPrimary' : 'textMuted'}>
              {serviceId === null && !now ? t('commission.rules.noRule') : describe(now)}
            </Text>
            {next ? (
              <Text variant="helper" color="textSecondary">
                {t('commission.rules.startsOn', {
                  rule: describe(next),
                  date: formatDate(
                    `${next.effectiveFrom}T12:00:00Z` as UtcIso,
                    'UTC',
                    i18n.language,
                    'medium',
                  ),
                })}
              </Text>
            ) : null}
            {serviceId === null ? (
              <Text variant="helper" color="textMuted">
                {t('commission.rules.defaultHint')}
              </Text>
            ) : null}
          </View>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setEditing({ serviceId, targetName: name })}
          >
            {t('commission.rules.set')}
          </Button>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.stack}>
      <Select
        label={t('commission.rules.chooseStaff')}
        placeholder={t('commission.rules.chooseStaffPlaceholder')}
        options={(staff.data ?? []).map((s) => ({ value: s.id, label: s.displayName }))}
        value={staffId}
        onChange={setStaffId}
        disabled={staff.isPending}
      />

      {!staffId ? (
        <EmptyState compact icon={Percent} title={t('commission.rules.chooseStaffPlaceholder')} />
      ) : rules.isError ? (
        <ErrorState
          title={t('commission.error.title')}
          description={rules.error.message}
          onRetry={() => void rules.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : rules.isPending || services.isPending ? (
        [0, 1, 2].map((i) => <Skeleton key={i} height={84} radius="lg" />)
      ) : (
        <>
          {row(null, t('commission.rules.default'))}
          <Text variant="sectionTitle">{t('commission.rules.services')}</Text>
          {(services.data ?? []).map((service) => row(service.id, service.name))}
          <Collapsible title={t('commission.rules.history')}>
            {list.length === 0 ? (
              <Text variant="helper" color="textMuted">
                {t('commission.rules.historyEmpty')}
              </Text>
            ) : (
              list.map((rule) => (
                <Text key={rule.id} variant="helper" color="textSecondary">
                  {formatDate(
                    `${rule.effectiveFrom}T12:00:00Z` as UtcIso,
                    'UTC',
                    i18n.language,
                    'medium',
                  )}{' '}
                  ·{' '}
                  {rule.serviceId
                    ? ((services.data ?? []).find((s) => s.id === rule.serviceId)?.name ?? '')
                    : t('commission.rules.default')}{' '}
                  · {describe(rule)}
                </Text>
              ))
            )}
          </Collapsible>
        </>
      )}

      {editing && staffId && selected ? (
        <RuleDrawer
          key={`${staffId}:${editing.serviceId ?? 'default'}`}
          staffId={staffId}
          serviceId={editing.serviceId}
          targetName={`${selected.displayName} · ${editing.targetName}`}
          current={currentRule(list, editing.serviceId, today)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[12] },
  headText: { flex: 1, gap: theme.spacing[2] },
});
