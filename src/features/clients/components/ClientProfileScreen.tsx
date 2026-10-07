import { Lock, Pencil } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PageContainer, Screen } from '@/components/layout';
import { Avatar, StatusBadge } from '@/components/shared';
import {
  Button,
  Card,
  Dialog,
  Drawer,
  ErrorState,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { ClientFilesSection } from '@/features/files/components/ClientFilesSection';
import { ClientFormsSection } from '@/features/forms/components/ClientFormsSection';
import { ClientPackagesSection } from '@/features/packages/components/ClientPackagesSection';
import { useAppointmentList } from '@/features/appointments/api/useAppointments';
import { type AppointmentRow } from '@/features/appointments/types';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDateTime, todayInZone } from '@/lib/time';

import { useArchiveClient, useClient } from '../api/useClients';
import { ClientForm } from './ClientForm';

export type ClientProfileScreenProps = {
  clientId: string;
};

export function ClientProfileScreen({ clientId }: ClientProfileScreenProps) {
  const { t, i18n } = useTranslation();
  const { businessId, business, branchId } = useCurrentScope();
  const canEdit = usePermission('clients.edit').allowed;
  const canViewContact = usePermission('clients.view_contact').allowed;
  const canViewAppointments = usePermission('appointments.view').allowed;

  const client = useClient(businessId, clientId, canViewContact);
  const archiveClient = useArchiveClient(businessId);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const timeZone = useMemo(() => {
    const branch = business?.branches.find((b) => b.id === branchId);
    return branch?.timezone ?? 'UTC';
  }, [business, branchId]);

  const today = todayInZone(timeZone);

  // Two separate queries rather than one list split client-side: upcoming
  // and history have opposite "what matters most" ordering, and the RPC's
  // fixed starts_at DESC sort (context/appointments.md) already gives
  // history exactly what it wants — upcoming only needs its own date filter.
  const upcoming = useAppointmentList(canViewAppointments ? businessId : null, {
    clientId,
    fromDate: today,
  });
  const history = useAppointmentList(canViewAppointments ? businessId : null, {
    clientId,
    toDate: today,
  });

  if (client.isError) {
    return (
      <Screen edges={['top']}>
        <PageContainer title={t('clients.title')}>
          <ErrorState
            title={t('clients.error.title')}
            description={client.error.message}
            onRetry={() => void client.refetch()}
            retryLabel={t('actions.retry')}
          />
        </PageContainer>
      </Screen>
    );
  }

  if (client.isPending || !client.data) {
    return (
      <Screen edges={['top']}>
        <PageContainer title={t('clients.title')}>
          <Skeleton height={120} radius="lg" />
        </PageContainer>
      </Screen>
    );
  }

  const data = client.data;
  // Upcoming shows soonest-first; the RPC's fixed sort is starts_at DESC,
  // so this one page's rows are reversed for display only.
  const upcomingRows = (upcoming.data?.pages.flatMap((page) => page.rows) ?? []).slice().reverse();
  const historyRows = history.data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <Screen edges={['top']}>
      <PageContainer
        title={data.fullName}
        actions={
          canEdit ? (
            <View style={styles.actionsRow}>
              <Button variant="ghost" size="sm" startIcon={Pencil} onPress={() => setEditing(true)}>
                {t('clients.edit')}
              </Button>
              <Button variant="ghost" size="sm" onPress={() => setConfirmArchive(true)}>
                {data.isArchived ? t('clients.unarchive') : t('clients.archive')}
              </Button>
            </View>
          ) : null
        }
      >
        <View style={styles.container}>
          <Card>
            <View style={styles.header}>
              <Avatar name={data.fullName} size={48} />
              <View style={styles.headerText}>
                <Text variant="cardTitle">{data.fullName}</Text>
                {data.isArchived ? <StatusBadge status="cancelled" /> : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text variant="label" color="textSecondary">
                {t('clients.profile.contact')}
              </Text>
              {canViewContact ? (
                <>
                  <Text variant="body">{data.phoneE164}</Text>
                  {data.email ? <Text variant="body">{data.email}</Text> : null}
                </>
              ) : (
                <View style={styles.hiddenContact}>
                  <Lock size={14} strokeWidth={1.75} color={theme.colors.textMuted} />
                  <Text variant="helper" color="textMuted">
                    {t('clients.contactHidden')}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text variant="label" color="textSecondary">
                {t('clients.profile.notes')}
              </Text>
              <Text variant="body" color={data.notes ? 'textPrimary' : 'textMuted'}>
                {data.notes ?? t('clients.profile.noNotes')}
              </Text>
            </View>
          </Card>

          {/* Add-on "Packages & Sessions": renders nothing when the add-on is off. */}
          <ClientPackagesSection clientId={clientId} />

          {/* Add-ons "Files & Photos" and "Forms & Consent": each renders nothing while its add-on is off. */}
          <ClientFilesSection clientId={clientId} />
          <ClientFormsSection clientId={clientId} clientName={data.fullName} />

          {canViewAppointments ? (
            <>
              <View style={styles.section}>
                <Text variant="sectionTitle">{t('clients.profile.upcoming')}</Text>
                {upcoming.isPending ? (
                  <Skeleton height={60} radius="md" />
                ) : upcomingRows.length === 0 ? (
                  <Text variant="helper" color="textMuted">
                    {t('clients.profile.noUpcoming')}
                  </Text>
                ) : (
                  <Card noPadding>
                    {upcomingRows.map((row, index) => (
                      <AppointmentRowSummary
                        key={row.id}
                        appointment={row}
                        timeZone={timeZone}
                        locale={i18n.language}
                        isLast={index === upcomingRows.length - 1}
                      />
                    ))}
                  </Card>
                )}
              </View>

              <View style={styles.section}>
                <Text variant="sectionTitle">{t('clients.profile.history')}</Text>
                {history.isPending ? (
                  <Skeleton height={120} radius="md" />
                ) : historyRows.length === 0 ? (
                  <Text variant="helper" color="textMuted">
                    {t('clients.profile.noHistory')}
                  </Text>
                ) : (
                  <Card noPadding>
                    {historyRows.map((row, index) => (
                      <AppointmentRowSummary
                        key={row.id}
                        appointment={row}
                        timeZone={timeZone}
                        locale={i18n.language}
                        isLast={index === historyRows.length - 1}
                      />
                    ))}
                  </Card>
                )}
                {history.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={history.isFetchingNextPage}
                    onPress={() => void history.fetchNextPage()}
                  >
                    {t('clients.profile.loadMoreHistory')}
                  </Button>
                ) : null}
              </View>

              <View style={styles.section}>
                <Text variant="sectionTitle">{t('clients.profile.invoices')}</Text>
                <Card>
                  <Text variant="helper" color="textMuted">
                    {t('clients.profile.invoicesComingSoon')}
                  </Text>
                </Card>
              </View>
            </>
          ) : null}
        </View>
      </PageContainer>

      <Drawer open={editing} onClose={() => setEditing(false)} title={t('clients.edit')}>
        <ClientForm
          client={data}
          businessId={businessId}
          onDone={() => setEditing(false)}
          onOpenExisting={() => setEditing(false)}
        />
      </Drawer>

      <Dialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={
          data.isArchived ? t('clients.unarchiveConfirmTitle') : t('clients.archiveConfirmTitle')
        }
        message={
          data.isArchived
            ? t('clients.unarchiveConfirmMessage')
            : t('clients.archiveConfirmMessage')
        }
        confirm={{
          label: data.isArchived ? t('clients.unarchive') : t('clients.archive'),
          variant: data.isArchived ? 'primary' : 'danger',
          loading: archiveClient.isPending,
          onPress: () =>
            archiveClient.mutate(
              { id: clientId, archived: !data.isArchived },
              {
                onSuccess: () => {
                  setConfirmArchive(false);
                  toast.show({ message: t('clients.saved'), tone: 'success' });
                },
                onError: (error) => toast.show({ message: error.message, tone: 'error' }),
              },
            ),
        }}
      />
    </Screen>
  );
}

function AppointmentRowSummary({
  appointment,
  timeZone,
  locale,
  isLast,
}: {
  appointment: AppointmentRow;
  timeZone: string;
  locale: string;
  isLast: boolean;
}) {
  return (
    <View style={[styles.historyRow, isLast ? null : styles.historyRowDivider]}>
      <View style={styles.historyRowBody}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {appointment.serviceName}
        </Text>
        <Text variant="helper" color="textSecondary" numberOfLines={1}>
          {formatDateTime(appointment.startsAt, timeZone, locale, 'medium')}
          {appointment.staffName ? ` · ${appointment.staffName}` : ''}
        </Text>
      </View>
      <StatusBadge status={appointment.status} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[20],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing[8],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginBottom: theme.spacing[16],
  },
  headerText: {
    gap: theme.spacing[4],
  },
  section: {
    gap: theme.spacing[8],
  },
  hiddenContact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    minHeight: theme.layout.minTouchTarget,
  },
  historyRowDivider: {
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.borderSubtle,
  },
  historyRowBody: {
    flex: 1,
    gap: theme.spacing[2],
  },
});
