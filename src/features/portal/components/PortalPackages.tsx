import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react-native';

import { Badge, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { formatDate, formatDateTime, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { usePortalPackages } from '../api/usePortal';

export function PortalPackages({ slug, session }: { slug: string; session: string }) {
  const { t, i18n } = useTranslation();
  const q = usePortalPackages(slug, session, true);

  if (q.isPending) return <Skeleton height={96} radius="md" />;
  if (q.isError) {
    return (
      <ErrorState
        title={t('portal.loadErrorTitle')}
        description={t('portal.loadErrorBody')}
        onRetry={() => q.refetch()}
        retryLabel={t('actions.retry')}
        compact
      />
    );
  }
  if (q.data.rows.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title={t('portal.packages.empty')}
        description={t('portal.packages.emptyBody')}
      />
    );
  }
  return (
    <View style={styles.wrap}>
      {q.data.rows.map((p) => {
        const total = p.sessions_purchased + p.sessions_bonus;
        return (
          <Card key={p.id}>
            <View style={styles.row}>
              <Text variant="cardTitle" style={styles.grow}>
                {p.name}
              </Text>
              {p.is_cancelled ? <Badge tone="error">{t('portal.packages.cancelled')}</Badge> : null}
              {!p.is_cancelled && p.is_expired ? (
                <Badge tone="warning">{t('portal.packages.expired')}</Badge>
              ) : null}
            </View>
            <Text variant="body">
              {t('portal.packages.remaining', { count: p.remaining, total })}
            </Text>
            {p.expires_at ? (
              <Text variant="helper" color="textSecondary">
                {t('portal.packages.expires', {
                  date: formatDate(p.expires_at as UtcIso, 'UTC', i18n.language),
                })}
              </Text>
            ) : null}
            {p.history.length > 0 ? (
              <View style={styles.history}>
                <Text variant="label">{t('portal.packages.history')}</Text>
                {p.history.map((h, i) => (
                  <Text key={`${h.at}-${i}`} variant="helper" color="textSecondary">
                    {`${h.kind === 'deduct' ? t('portal.packages.used') : t('portal.packages.restored')} · ${formatDateTime(h.at as UtcIso, 'UTC', i18n.language, 'short')}${h.service_name ? ` · ${h.service_name}` : ''}`}
                  </Text>
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
  history: { marginTop: theme.spacing[8], gap: theme.spacing[4] },
});
