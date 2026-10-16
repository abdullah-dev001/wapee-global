import { Building2, Pencil, Plus, Star } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { MonthStepper } from '@/components/shared';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import { formatMinor } from '@/features/invoices/format';
import { barPercent } from '@/features/invoices/invoiceLogic';
import { monthBounds, shiftMonth } from '@/features/advanced-reports/periodLogic';
import { useCurrentScope } from '@/lib/permissions';
import { RpcError, rpcCode } from '@/lib/supabase';
import { todayInZone } from '@/lib/time';
import { theme } from '@/lib/theme';

import {
  useArchiveBranch,
  useBranchAdmin,
  useCombinedOverview,
  useRestoreBranch,
  useSetPrimaryBranch,
} from '../api/useBranches';
import { branchErrorKey, sortCurrencyTotals, type BranchRow } from '../branchLogic';
import { BranchFormDrawer } from './BranchFormDrawer';

type Tab = 'locations' | 'overview';
type Confirm = { kind: 'archive' | 'restore' | 'primary'; branch: BranchRow } | null;

/**
 * Locations: a list with add / edit / archive / restore / make-main, and an
 * overview that shows every location the person may report on, with totals per
 * currency (never added across currencies).
 */
export function BranchesScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  const branches = useBranchAdmin(businessId);
  const archive = useArchiveBranch(businessId);
  const restore = useRestoreBranch(businessId);
  const makePrimary = useSetPrimaryBranch(businessId);

  const [tab, setTab] = useState<Tab>('locations');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const all = branches.data ?? [];
  const visible = all.filter((branch) => showArchived || !branch.archived);

  const fail = (error: Error) => {
    const count = error instanceof RpcError ? (error.extra.count as number | undefined) : undefined;
    toast.show({
      message: t(branchErrorKey(rpcCode(error)), { count: count ?? 0 }),
      tone: 'error',
    });
    setConfirm(null);
  };

  const runConfirm = () => {
    if (!confirm) return;
    const { kind, branch } = confirm;
    const done = (message: string) => () => {
      toast.show({ message, tone: 'success' });
      setConfirm(null);
    };
    if (kind === 'archive')
      archive.mutate(
        { branchId: branch.id },
        { onSuccess: done(t('branches.archivedToast')), onError: fail },
      );
    else if (kind === 'restore')
      restore.mutate(
        { branchId: branch.id },
        { onSuccess: done(t('branches.restoredToast')), onError: fail },
      );
    else
      makePrimary.mutate(
        { branchId: branch.id },
        { onSuccess: done(t('branches.primaryToast')), onError: fail },
      );
  };
  const busy = archive.isPending || restore.isPending || makePrimary.isPending;

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={t('branches.title')}
        subtitle={t('branches.subtitle')}
        actions={
          <Button
            size="sm"
            startIcon={Plus}
            onPress={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t('branches.add')}
          </Button>
        }
      >
        <View style={styles.tabs}>
          <Tabs
            items={[
              { value: 'locations', label: t('branches.tabs.locations') },
              { value: 'overview', label: t('branches.tabs.overview') },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        {tab === 'locations' ? (
          <View style={styles.list}>
            <Toggle
              value={showArchived}
              onValueChange={setShowArchived}
              label={t('branches.showArchived')}
            />
            {branches.isError ? (
              <ErrorState
                title={t('branches.error.title')}
                description={t(branchErrorKey(rpcCode(branches.error)))}
                onRetry={() => void branches.refetch()}
                retryLabel={t('actions.retry')}
              />
            ) : branches.isPending ? (
              [0, 1].map((i) => <Skeleton key={i} height={96} radius="lg" />)
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Building2}
                title={t('branches.empty.title')}
                description={t('branches.empty.description')}
              />
            ) : (
              visible.map((branch) => (
                <Card key={branch.id}>
                  <View style={styles.head}>
                    <View style={styles.headText}>
                      <Text variant="cardTitle" numberOfLines={1}>
                        {branch.name}
                      </Text>
                      <Text variant="helper" color="textSecondary">
                        {t('branches.summary', {
                          currency: branch.currency,
                          timezone: branch.timezone,
                          prefix: branch.invoicePrefix,
                        })}
                      </Text>
                      {branch.address ? (
                        <Text variant="helper" color="textMuted">
                          {branch.address}
                        </Text>
                      ) : null}
                    </View>
                    {branch.isPrimary ? (
                      <Badge tone="primary">{t('branches.primary')}</Badge>
                    ) : null}
                    {branch.archived ? (
                      <Badge tone="neutral">{t('branches.archived')}</Badge>
                    ) : null}
                  </View>
                  <View style={styles.actions}>
                    {!branch.archived ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          startIcon={Pencil}
                          onPress={() => {
                            setEditing(branch);
                            setFormOpen(true);
                          }}
                        >
                          {t('branches.edit')}
                        </Button>
                        {!branch.isPrimary ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              startIcon={Star}
                              onPress={() => setConfirm({ kind: 'primary', branch })}
                            >
                              {t('branches.makePrimary')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() => setConfirm({ kind: 'archive', branch })}
                            >
                              {t('branches.archive')}
                            </Button>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => setConfirm({ kind: 'restore', branch })}
                      >
                        {t('branches.restore')}
                      </Button>
                    )}
                  </View>
                </Card>
              ))
            )}
          </View>
        ) : (
          <Overview />
        )}
      </PageContainer>

      <BranchFormDrawer
        branch={editing}
        open={formOpen}
        branches={all}
        onClose={() => setFormOpen(false)}
      />

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm
            ? t(
                confirm.kind === 'archive'
                  ? 'branches.archiveTitle'
                  : confirm.kind === 'restore'
                    ? 'branches.restoreTitle'
                    : 'branches.primaryTitle',
                { name: confirm.branch.name },
              )
            : ''
        }
        message={
          confirm
            ? t(
                confirm.kind === 'archive'
                  ? 'branches.archiveMessage'
                  : confirm.kind === 'restore'
                    ? 'branches.restoreMessage'
                    : 'branches.primaryMessage',
              )
            : undefined
        }
        cancelLabel={t('actions.cancel')}
        busy={busy}
        confirm={{
          label: confirm?.kind === 'archive' ? t('branches.archiveConfirm') : t('branches.confirm'),
          variant: confirm?.kind === 'archive' ? 'danger' : 'primary',
          loading: busy,
          onPress: runConfirm,
        }}
      />
    </Screen>
  );
}

/** One month, every location the person may report on; money per currency. */
function Overview() {
  const { t, i18n } = useTranslation();
  const { businessId, business } = useCurrentScope();
  const zone = business?.branches.find((b) => b.is_primary)?.timezone ?? 'UTC';
  const [anchor, setAnchor] = useState(() => todayInZone(zone));
  const { from, to } = monthBounds(anchor);
  const overview = useCombinedOverview(businessId, from, to);

  return (
    <View style={styles.list}>
      <MonthStepper
        anchor={anchor}
        onPrevious={() => setAnchor(shiftMonth(anchor, -1))}
        onNext={() => setAnchor(shiftMonth(anchor, 1))}
        previousLabel={t('branches.overview.previous')}
        nextLabel={t('branches.overview.next')}
      />
      <Text variant="helper" color="textSecondary">
        {t('branches.overview.note')}
      </Text>

      {overview.isError ? (
        <ErrorState
          title={t('branches.error.title')}
          description={t(branchErrorKey(rpcCode(overview.error)))}
          onRetry={() => void overview.refetch()}
          retryLabel={t('actions.retry')}
        />
      ) : overview.isPending ? (
        [0, 1].map((i) => <Skeleton key={i} height={110} radius="lg" />)
      ) : (
        <>
          <Text variant="sectionTitle">{t('branches.overview.totals')}</Text>
          {overview.data.totals.length === 0 ? (
            <Text variant="helper" color="textMuted">
              {t('branches.overview.noRevenueAccess')}
            </Text>
          ) : (
            sortCurrencyTotals(overview.data.totals).map((total) => (
              <Card key={total.currency}>
                <View style={styles.head}>
                  <Text variant="cardTitle">{total.currency}</Text>
                  <Text variant="helper" color="textSecondary">
                    {t('branches.overview.locationsCount', { count: total.branches })}
                  </Text>
                </View>
                <Text variant="statValue">
                  {formatMinor(total.netRevenueMinor, total.currency, i18n.language)}
                </Text>
                <Text variant="helper" color="textSecondary">
                  {t('branches.overview.net')} · {t('branches.overview.collected')}{' '}
                  {formatMinor(total.collectedMinor, total.currency, i18n.language)} ·{' '}
                  {t('branches.overview.invoices')} {total.invoiceCount}
                </Text>
              </Card>
            ))
          )}

          <Text variant="sectionTitle">{t('branches.overview.byBranch')}</Text>
          {overview.data.branches.map((branch) => {
            const max = Math.max(
              0,
              ...overview.data.branches
                .filter((b) => b.currency === branch.currency)
                .map((b) => b.netRevenueMinor ?? 0),
            );
            return (
              <Card key={branch.branchId}>
                <View style={styles.head}>
                  <Text variant="bodyStrong" style={styles.headText} numberOfLines={1}>
                    {branch.name}
                    {branch.archived ? ` (${t('branches.overview.archivedNote')})` : ''}
                  </Text>
                  <Text variant="helper" color="textSecondary">
                    {branch.currency}
                  </Text>
                </View>
                {branch.netRevenueMinor !== null ? (
                  <>
                    <Text variant="body">
                      {formatMinor(branch.netRevenueMinor, branch.currency, i18n.language)}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          { width: `${barPercent(branch.netRevenueMinor, max)}%` },
                        ]}
                      />
                    </View>
                  </>
                ) : null}
                {branch.appointments ? (
                  <Text variant="helper" color="textSecondary">
                    {t('branches.overview.appointments')} {branch.appointments.total} ·{' '}
                    {t('branches.overview.completed')} {branch.appointments.completed} ·{' '}
                    {t('branches.overview.cancelled')} {branch.appointments.cancelled} ·{' '}
                    {t('branches.overview.noShow')} {branch.appointments.noShow}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { marginBottom: theme.spacing[16] },
  list: { gap: theme.spacing[12] },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
  headText: { flex: 1, gap: theme.spacing[2] },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginTop: theme.spacing[12],
  },
  barTrack: {
    height: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderSubtle,
    overflow: 'hidden',
    marginVertical: theme.spacing[6],
  },
  bar: { height: 6, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary },
});
