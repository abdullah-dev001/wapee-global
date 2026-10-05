import { MailX } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { usePagePadding } from '@/components/layout/usePagePadding';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  Text,
} from '@/components/ui';
import { useCurrentScope } from '@/lib/permissions';
import { formatDateTime, type UtcIso } from '@/lib/time';
import { theme } from '@/lib/theme';

import { useMessagesLog, type MessageLogFilters, type MessageLogRow } from '../api/useMessagesLog';
import {
  channelKey,
  codeKey,
  eventKey,
  formatCredits,
  statusKey,
  statusTone,
  type MessageChannel,
} from '../messageLogic';

const ALL = 'all';

/**
 * The messages log for owners and managers (settings.booking): status, channel,
 * event, masked recipient, cost and a short error, newest first, 20 per page,
 * filtered on the server. The log never holds a message body, address or link.
 */
export function MessagesLogScreen() {
  const { t, i18n } = useTranslation();
  const { businessId, business } = useCurrentScope();
  const pagePadding = usePagePadding();
  const [filters, setFilters] = useState<MessageLogFilters>({
    branchId: null,
    channel: null,
    status: null,
  });
  const list = useMessagesLog(businessId, filters);
  const branches = business?.branches ?? [];
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const zoneOf = (branchId: string | null) =>
    branches.find((b) => b.id === branchId)?.timezone ?? branches[0]?.timezone ?? 'UTC';
  const filtered = filters.branchId !== null || filters.channel !== null || filters.status !== null;

  return (
    <Screen edges={['top']} scroll={false}>
      <PageContainer
        title={t('notifications.log.title')}
        subtitle={t('notifications.log.subtitle')}
      >
        <View style={styles.filters}>
          <View style={styles.filter}>
            <Select
              label={t('notifications.log.filters.channel')}
              title={t('notifications.log.filters.channel')}
              value={filters.channel ?? ALL}
              onChange={(v) =>
                setFilters({ ...filters, channel: v === ALL ? null : (v as MessageChannel) })
              }
              options={[
                { value: ALL, label: t('notifications.log.filters.allChannels') },
                ...(['email', 'sms', 'push'] as const).map((c) => ({
                  value: c,
                  label: t(channelKey(c)),
                })),
              ]}
            />
          </View>
          <View style={styles.filter}>
            <Select
              label={t('notifications.log.filters.status')}
              title={t('notifications.log.filters.status')}
              value={filters.status ?? ALL}
              onChange={(v) =>
                setFilters({
                  ...filters,
                  status: v === ALL ? null : (v as 'sent' | 'failed' | 'skipped'),
                })
              }
              options={[
                { value: ALL, label: t('notifications.log.filters.allStatuses') },
                ...(['sent', 'skipped', 'failed'] as const).map((s) => ({
                  value: s,
                  label: t(statusKey(s)),
                })),
              ]}
            />
          </View>
          {branches.length > 1 ? (
            <View style={styles.filter}>
              <Select
                label={t('notifications.log.filters.branch')}
                title={t('notifications.log.filters.branch')}
                value={filters.branchId ?? ALL}
                onChange={(v) => setFilters({ ...filters, branchId: v === ALL ? null : v })}
                options={[
                  { value: ALL, label: t('notifications.log.filters.allBranches') },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </View>
          ) : null}
        </View>
      </PageContainer>

      <View style={[styles.body, { paddingHorizontal: pagePadding }]}>
        {list.isPending ? (
          <View style={styles.list}>
            {[0, 1, 2].map((n) => (
              <Card key={n}>
                <Skeleton width="40%" height={16} />
                <Skeleton height={14} style={styles.skeletonLine} />
              </Card>
            ))}
          </View>
        ) : list.isError ? (
          <ErrorState
            title={t('notifications.log.loadError')}
            onRetry={() => void list.refetch()}
            retryLabel={t('actions.retry')}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MailX}
            title={filtered ? t('notifications.log.emptyFiltered') : t('notifications.log.empty')}
            description={
              filtered
                ? t('notifications.log.emptyFilteredMessage')
                : t('notifications.log.emptyMessage')
            }
            action={
              filtered
                ? {
                    children: t('notifications.log.filters.clear'),
                    variant: 'secondary',
                    onPress: () => setFilters({ branchId: null, channel: null, status: null }),
                  }
                : undefined
            }
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(row) => String(row.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <LogRow row={item} zone={zoneOf(filters.branchId)} locale={i18n.language} />
            )}
            ListFooterComponent={
              list.hasNextPage ? (
                <View style={styles.more}>
                  <Button
                    variant="secondary"
                    loading={list.isFetchingNextPage}
                    onPress={() => void list.fetchNextPage()}
                  >
                    {t('notifications.log.loadMore')}
                  </Button>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </Screen>
  );
}

function LogRow({ row, zone, locale }: { row: MessageLogRow; zone: string; locale: string }) {
  const { t } = useTranslation();
  const code = codeKey(row.code);
  return (
    <Card>
      <View style={styles.top}>
        <View style={styles.text}>
          <Text variant="bodyStrong">{t(eventKey(row.event))}</Text>
          <Text variant="helper" color="textSecondary">
            {t(channelKey(row.channel))}
            {row.recipientMasked ? ` · ${row.recipientMasked}` : ''}
          </Text>
        </View>
        <Badge tone={statusTone(row.status)} dot>
          {t(statusKey(row.status))}
        </Badge>
      </View>
      <Text variant="helper" color="textSecondary">
        {formatDateTime(row.createdAt as UtcIso, zone, locale, 'medium')}
        {row.credits
          ? ` · ${t('notifications.log.cost', { credits: formatCredits(row.credits, locale) })}`
          : ''}
        {row.segments ? ` · ${t('notifications.log.costSegments', { count: row.segments })}` : ''}
      </Text>
      {code ? (
        <Text variant="helper" color={row.status === 'failed' ? 'error' : 'warning'}>
          {t(code)}
        </Text>
      ) : null}
      {row.error ? (
        <Text variant="helper" color="textMuted">
          {row.error}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: {
    marginTop: theme.spacing[8],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
  },
  filter: { flexGrow: 1, flexBasis: 200, maxWidth: 320 },
  body: { flex: 1, marginTop: theme.spacing[12] },
  list: { gap: theme.spacing[12], paddingBottom: theme.spacing[32] },
  skeletonLine: { marginVertical: theme.spacing[8] },
  more: { alignItems: 'center', paddingVertical: theme.spacing[16] },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
    alignItems: 'flex-start',
  },
  text: { flex: 1, gap: theme.spacing[2] },
});
