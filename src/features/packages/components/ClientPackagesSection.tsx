import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, ErrorState, Skeleton, Text } from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDate, type IanaTimeZone, type LocaleTag, type UtcIso } from '@/lib/time';

import { useClientPackages } from '../api/usePackages';
import { packageState, totalSessions, type PackageState } from '../packageLogic';

const STATE_TONE: Record<PackageState, 'success' | 'neutral' | 'warning' | 'error'> = {
  active: 'success',
  used_up: 'neutral',
  expired: 'warning',
  cancelled: 'error',
};

/**
 * A client's packages with the balance, on the client profile. Hidden entirely when the add-on is
 * off or the member holds none of the package permissions (the server also returns nothing).
 */
export function ClientPackagesSection({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const { businessId, branchId, business } = useCurrentScope();
  const sell = usePermission('packages.sell');
  const deduct = usePermission('packages.deduct_session');
  const reverse = usePermission('packages.reverse_session');
  const visible = sell.allowed || deduct.allowed || reverse.allowed;
  const packages = useClientPackages(businessId, clientId, { enabled: visible });
  const timeZone = (business?.branches.find((b) => b.id === branchId)?.timezone ??
    'UTC') as IanaTimeZone;
  const locale = i18n.language as LocaleTag;

  if (!visible) return null;

  return (
    <View style={styles.stack}>
      <Text variant="sectionTitle">{t('packages.client.title')}</Text>
      {packages.isError ? (
        <ErrorState
          title={t('packages.client.error')}
          description={packages.error.message}
          onRetry={() => void packages.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : packages.isPending ? (
        <Skeleton height={72} />
      ) : (packages.data ?? []).length === 0 ? (
        <Text variant="body" color="textMuted">
          {t('packages.client.empty')}
        </Text>
      ) : (
        (packages.data ?? []).map((pkg) => {
          const state = packageState(pkg);
          return (
            <Card key={pkg.id}>
              <View style={styles.head}>
                <View style={styles.grow}>
                  <Text variant="cardTitle" numberOfLines={1}>
                    {pkg.name}
                  </Text>
                  <Text variant="bodyStrong">
                    {t('packages.client.remaining', {
                      remaining: pkg.remaining,
                      total: totalSessions(pkg),
                    })}
                    {pkg.sessionsBonus > 0
                      ? ` (${t('packages.client.bonusIncluded', { count: pkg.sessionsBonus })})`
                      : ''}
                  </Text>
                </View>
                <Badge tone={STATE_TONE[state]}>{t(`packages.state.${state}`)}</Badge>
              </View>
              <Text variant="helper" color="textMuted">
                {t('packages.client.soldOn', {
                  date: formatDate(pkg.soldAt as UtcIso, timeZone, locale, 'medium'),
                })}
                {' · '}
                {pkg.expiresAt
                  ? t('packages.client.expiresOn', {
                      date: formatDate(pkg.expiresAt as UtcIso, timeZone, locale, 'medium'),
                    })
                  : t('packages.client.neverExpires')}
                {' · '}
                {formatMinor(pkg.priceMinor, pkg.currency, i18n.language)}
              </Text>
            </Card>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[8] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[8] },
  grow: { flex: 1, gap: theme.spacing[4] },
});
