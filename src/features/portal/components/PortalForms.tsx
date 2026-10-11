import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react-native';

import { Badge, Card, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { formatDate, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { usePortalForms } from '../api/usePortal';

/** Read-only list of the forms the customer signed: title, date, signer, status. Never the answers or the signature. */
export function PortalForms({ slug, session }: { slug: string; session: string }) {
  const { t, i18n } = useTranslation();
  const q = usePortalForms(slug, session, true);

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
        icon={FileText}
        title={t('portal.forms.empty')}
        description={t('portal.forms.emptyBody')}
      />
    );
  }
  return (
    <View style={styles.wrap}>
      {q.data.rows.map((f) => (
        <Card key={f.id}>
          <View style={styles.row}>
            <Text variant="cardTitle" style={styles.grow}>
              {f.title}
            </Text>
            {f.voided ? <Badge tone="error">{t('portal.forms.voided')}</Badge> : null}
          </View>
          <Text variant="helper" color="textSecondary">
            {`${formatDate(f.signed_at as UtcIso, 'UTC', i18n.language)} · ${t('portal.forms.signedBy', { name: f.signer_name })}`}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  grow: { flex: 1 },
});
