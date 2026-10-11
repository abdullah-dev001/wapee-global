import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleCheck } from 'lucide-react-native';

import { Button, Card, Text } from '@/components/ui';
import { PublicApiError } from '@/features/booking-public/types';
import { theme } from '@/lib/theme';

import { usePortalRequestData } from '../api/usePortal';
import { portalErrorKey } from '../portalLogic';

type Kind = 'export' | 'erase';

/**
 * "My data": two plain requests, a copy of the customer's data and erasure. Both only CREATE a request the business
 * handles; the confirmation is calm and says nothing has been deleted yet.
 */
export function PortalData({ slug, session }: { slug: string; session: string }) {
  const { t } = useTranslation();
  const request = usePortalRequestData(slug, session);
  const [sent, setSent] = useState<{ kind: Kind; duplicate: boolean } | null>(null);
  const [pending, setPending] = useState<Kind | null>(null);

  const send = (kind: Kind) => {
    setPending(kind);
    request.mutate(kind, {
      onSuccess: (r) => setSent({ kind, duplicate: r.duplicate }),
      onSettled: () => setPending(null),
    });
  };
  const error = request.error;
  const errorText = error
    ? t(portalErrorKey(error instanceof PublicApiError ? error.code : null))
    : null;

  return (
    <View style={styles.stack}>
      <Text variant="sectionTitle">{t('portal.data.title')}</Text>
      <Text variant="paragraph" color="textSecondary">
        {t('portal.data.intro')}
      </Text>
      {sent ? (
        <Card>
          <View style={styles.sent} accessibilityRole="alert">
            <CircleCheck
              size={theme.iconSize.lg}
              strokeWidth={theme.iconStroke}
              color={theme.colors.successText}
            />
            <View style={styles.grow}>
              <Text variant="cardTitle">{t('portal.data.sentTitle')}</Text>
              <Text variant="helper" color="textSecondary">
                {sent.duplicate ? t('portal.data.alreadySent') : t('portal.data.sentBody')}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}
      {errorText ? (
        <Text variant="helper" color="error" role="alert">
          {errorText}
        </Text>
      ) : null}
      {(['export', 'erase'] as const).map((kind) => (
        <Card key={kind}>
          <View style={styles.stack}>
            <Text variant="cardTitle">{t(`portal.data.${kind}Title`)}</Text>
            <Text variant="helper" color="textSecondary">
              {t(`portal.data.${kind}Body`)}
            </Text>
            <View style={styles.row}>
              <Button
                variant={kind === 'erase' ? 'secondary' : 'primary'}
                size="sm"
                loading={pending === kind}
                disabled={pending !== null}
                onPress={() => send(kind)}
              >
                {t(`portal.data.${kind}Button`)}
              </Button>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  row: { flexDirection: 'row' },
  sent: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[10] },
  grow: { flex: 1, gap: theme.spacing[2] },
});
