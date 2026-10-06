import { Eye, ShieldAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { theme } from '@/lib/theme';
import { formatDateTime, type UtcIso } from '@/lib/time';

import { useSupportView, type SupportSummary } from '../api/useAdmin';
import { useAdminMessage } from './useAdminMessage';

/**
 * Read-only support summary. It says up front that opening it is logged; every
 * press writes an audit row (`admin.support_view`), so it never loads on its own.
 */
export function SupportViewSection({ businessId }: { businessId: string }) {
  const { t, i18n } = useTranslation();
  const messageOf = useAdminMessage();
  const view = useSupportView(businessId);
  const data = view.data;

  return (
    <Card>
      <View style={styles.stack}>
        <Text variant="sectionTitle">{t('admin.support.title')}</Text>
        <View style={styles.notice}>
          <ShieldAlert
            size={theme.iconSize.md}
            strokeWidth={theme.iconStroke}
            color={theme.colors.warning}
          />
          <Text variant="helper" color="textSecondary" style={styles.noticeText}>
            {t('admin.support.logged')}
          </Text>
        </View>
        <View style={styles.start}>
          <Button
            startIcon={Eye}
            variant="secondary"
            loading={view.isPending}
            onPress={() => view.mutate()}
          >
            {data ? t('admin.support.refresh') : t('admin.support.open')}
          </Button>
        </View>
        {view.isError ? (
          <Text variant="helper" color="error">
            {messageOf(view.error)}
          </Text>
        ) : null}
        {data ? <Summary data={data} locale={i18n.language} /> : null}
      </View>
    </Card>
  );
}

function Summary({ data, locale }: { data: SupportSummary; locale: string }) {
  const { t } = useTranslation();
  const pairs = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([k, n]) => `${k}: ${n}`)
      .join(' · ') || t('admin.support.none');
  return (
    <View style={styles.stack}>
      <Line label={t('admin.support.locations')}>
        {data.branches
          .map((b) => `${b.name} (${b.country}, ${b.currency}, ${b.timezone})`)
          .join('; ') || t('admin.support.none')}
      </Line>
      <Line label={t('admin.support.members')}>{pairs(data.membersByStatus)}</Line>
      <Line label={t('admin.support.staff')}>{String(data.staffActive)}</Line>
      <Line label={t('admin.support.appointments')}>{pairs(data.appointmentsLast30d)}</Line>
      <Line label={t('admin.support.addons')}>
        {data.addonsEnabled.join(', ') || t('admin.support.none')}
      </Line>
      <Text variant="label" color="textSecondary">
        {t('admin.support.activity')}
      </Text>
      {data.recentActivity.length === 0 ? (
        <Text variant="helper" color="textSecondary">
          {t('admin.support.none')}
        </Text>
      ) : (
        data.recentActivity.map((a, i) => (
          <Text key={`${a.at}-${i}`} variant="helper" color="textSecondary">
            {`${formatDateTime(a.at as UtcIso, 'UTC', locale, 'medium')} · ${a.action}`}
          </Text>
        ))
      )}
    </View>
  );
}

function Line({ label, children }: { label: string; children: string }) {
  return (
    <View style={styles.line}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <Text variant="body">{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[10] },
  start: { alignItems: 'flex-start' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[8] },
  noticeText: { flex: 1 },
  line: { gap: theme.spacing[2] },
});
