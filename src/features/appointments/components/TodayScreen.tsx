import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarX } from 'lucide-react-native';

import { PageContainer, Screen, usePagePadding } from '@/components/layout';
import { Avatar, StatusBadge } from '@/components/shared';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { LowStockBadge } from '@/features/inventory/components/LowStockBadge';
import { useAppointmentInvoices } from '@/features/invoices/api/useAppointmentInvoices';
import { AppointmentInvoiceButton } from '@/features/invoices/components/AppointmentInvoiceButton';
import { showReviewLink } from '@/features/reviews/reviewLinkStore';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { BranchSwitcher } from '@/features/branches/components';
import { focusRing, theme, useBreakpoint } from '@/lib/theme';
import { formatTime, todayInZone, type UtcIso } from '@/lib/time';

import {
  calendarAppointmentToRow,
  useApproveAppointment,
  useCalendarAppointments,
  useMarkCompleted,
  type CompletedResult,
  useMarkNoShow,
  type CalendarAppointment,
} from '../api/useAppointments';
import { minuteOfDayFromTime } from '../timeGrid';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer';
import { type AppointmentRow, type AppointmentStatus } from '../types';

/**
 * Mobile home / Today screen: today's appointments in the branch timezone,
 * in order, with the next one highlighted, counts, and quick status
 * actions — reuses the Phase 4 part B1 hooks/components wholesale.
 */
export function TodayScreen() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useBreakpoint();
  const { businessId, business, branchId } = useCurrentScope();
  const canApprove = usePermission('appointments.approve').allowed;
  const canEdit = usePermission('appointments.edit').allowed;
  const pagePadding = usePagePadding();

  const timeZone = useMemo(() => {
    const branch = business?.branches.find((b) => b.id === branchId);
    return branch?.timezone ?? 'UTC';
  }, [business, branchId]);

  const today = todayInZone(timeZone);
  const calendar = useCalendarAppointments(businessId, branchId, today, today, null, {
    live: true,
  });

  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [quickAction, setQuickAction] = useState<{
    appointment: CalendarAppointment;
    action: 'approve' | 'complete' | 'no_show';
  } | null>(null);

  const completedIds = useMemo(
    () =>
      (calendar.data?.rows ?? []).filter((row) => row.status === 'completed').map((row) => row.id),
    [calendar.data],
  );
  const invoiceLinks = useAppointmentInvoices(businessId, completedIds);

  const nowMinute = minuteOfDayFromTime(new Date().toISOString(), timeZone);

  const rows = useMemo(() => {
    const list = calendar.data?.rows ?? [];
    return [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [calendar.data]);

  const counts = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((row) => row.status === 'pending').length;
    const completed = rows.filter((row) => row.status === 'completed').length;
    return { total, pending, completed };
  }, [rows]);

  const nextAppointmentId = useMemo(() => {
    const upcoming = rows.find(
      (row) =>
        (row.status === 'confirmed' || row.status === 'pending') &&
        minuteOfDayFromTime(row.startsAt, timeZone) >= nowMinute,
    );
    return upcoming?.id ?? null;
  }, [rows, timeZone, nowMinute]);

  if (calendar.isError) {
    return (
      <Screen edges={['top']}>
        <PageContainer title={t('appointments.today')}>
          <ErrorState
            title={t('appointments.loadError')}
            description={calendar.error.message}
            onRetry={() => void calendar.refetch()}
            retryLabel={t('actions.retry')}
          />
        </PageContainer>
      </Screen>
    );
  }

  return (
    <Screen
      edges={['top']}
      onRefresh={() => void calendar.refetch()}
      refreshing={calendar.isRefetching}
    >
      <PageContainer title={t('appointments.today')}>
        {/* Phones have no top bar: the location switcher sits here (it renders nothing with one location). */}
        {isMobile ? (
          <View style={styles.switcher}>
            <BranchSwitcher compact />
          </View>
        ) : null}
        <View style={styles.counts}>
          <CountTile label={t('appointments.today')} value={counts.total} />
          {canApprove ? (
            <CountTile
              label={t('appointments.pendingApproval', { count: counts.pending })}
              value={counts.pending}
              tone={counts.pending > 0 ? 'warning' : 'neutral'}
            />
          ) : null}
          <CountTile label={t('appointments.status.completed')} value={counts.completed} />
        </View>
        <LowStockBadge />
      </PageContainer>

      <View style={[styles.body, { paddingHorizontal: pagePadding }]}>
        {calendar.isPending ? (
          <View style={styles.skeletonList}>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} height={72} radius="lg" />
            ))}
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title={t('appointments.noAppointments')}
            description={t('appointments.noAppointmentsHint')}
          />
        ) : (
          <View style={styles.list}>
            {rows.map((row) => (
              <TodayRow
                key={row.id}
                appointment={row}
                timeZone={timeZone}
                locale={i18n.language}
                isNext={row.id === nextAppointmentId}
                canApprove={canApprove}
                canEdit={canEdit}
                businessId={businessId}
                invoiceId={invoiceLinks.data?.[row.id] ?? null}
                onPress={() => setSelected(calendarAppointmentToRow(row, branchId ?? ''))}
                onQuickAction={(action) => setQuickAction({ appointment: row, action })}
              />
            ))}
          </View>
        )}
      </View>

      <AppointmentDetailDrawer
        appointment={selected}
        onClose={() => setSelected(null)}
        timeZone={timeZone}
        locale={i18n.language}
      />

      {quickAction ? (
        <QuickActionDialog
          appointment={quickAction.appointment}
          action={quickAction.action}
          businessId={businessId}
          onClose={() => setQuickAction(null)}
        />
      ) : null}
    </Screen>
  );
}

function CountTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <Card style={styles.countTile}>
      <Text variant="statValueMobile" color={tone === 'warning' ? 'warning' : 'textPrimary'}>
        {value}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

const STATUS_BORDER: Record<AppointmentStatus, keyof typeof theme.colors> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'info',
  cancelled: 'error',
  no_show: 'textMuted',
};

function TodayRow({
  appointment,
  timeZone,
  locale,
  isNext,
  canApprove,
  canEdit,
  businessId,
  invoiceId,
  onPress,
  onQuickAction,
}: {
  appointment: CalendarAppointment;
  timeZone: string;
  locale: string;
  isNext: boolean;
  canApprove: boolean;
  canEdit: boolean;
  businessId: string | null;
  invoiceId: string | null;
  onPress: () => void;
  onQuickAction: (action: 'approve' | 'complete' | 'no_show') => void;
}) {
  const { t } = useTranslation();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);

  const hasActions =
    (appointment.status === 'pending' && canApprove) ||
    appointment.status === 'completed' ||
    (appointment.status === 'confirmed' && canEdit);

  // The card is a plain View: the tappable summary and the action buttons are
  // SIBLINGS (a <button> inside a <button> is invalid HTML on web), and the
  // actions get their own line so a narrow phone does not squeeze the name out.
  return (
    <View
      style={[
        styles.row,
        { borderLeftColor: theme.colors[STATUS_BORDER[appointment.status]] },
        isNext ? styles.rowNext : null,
        showHover ? { opacity: 0.85 } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <Pressable {...handlers} onPress={onPress} accessibilityRole="button" style={styles.rowMain}>
        <View style={styles.rowTime}>
          <Text variant="bodyStrong">
            {formatTime(appointment.startsAt as UtcIso, timeZone, locale)}
          </Text>
          {isNext ? (
            <Text variant="caption" color="primary">
              {t('appointments.today')}
            </Text>
          ) : null}
        </View>

        <Avatar name={appointment.clientName} />

        <View style={styles.rowBody}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {appointment.clientName}
          </Text>
          <Text variant="helper" color="textSecondary" numberOfLines={1}>
            {appointment.serviceName}
            {appointment.staffName ? ` · ${appointment.staffName}` : ''}
          </Text>
        </View>

        <StatusBadge status={appointment.status} />
      </Pressable>

      {hasActions ? (
        <View style={styles.rowActions}>
          {appointment.status === 'pending' && canApprove ? (
            <Button size="sm" variant="secondary" onPress={() => onQuickAction('approve')}>
              {t('appointments.actions.approve')}
            </Button>
          ) : null}
          {appointment.status === 'completed' ? (
            <AppointmentInvoiceButton
              businessId={businessId}
              appointmentId={appointment.id}
              invoiceId={invoiceId}
              size="sm"
            />
          ) : null}
          {appointment.status === 'confirmed' && canEdit ? (
            <>
              <Button size="sm" variant="secondary" onPress={() => onQuickAction('complete')}>
                {t('appointments.actions.complete')}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => onQuickAction('no_show')}>
                {t('appointments.actions.noShow')}
              </Button>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function QuickActionDialog({
  appointment,
  action,
  businessId,
  onClose,
}: {
  appointment: CalendarAppointment;
  action: 'approve' | 'complete' | 'no_show';
  businessId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const approve = useApproveAppointment(businessId);
  const markCompleted = useMarkCompleted(businessId);
  const markNoShow = useMarkNoShow(businessId);

  const mutation =
    action === 'approve' ? approve : action === 'complete' ? markCompleted : markNoShow;
  const copy = {
    approve: {
      title: t('appointments.confirm.approveTitle'),
      message: t('appointments.confirm.approveMessage'),
      confirm: t('appointments.confirm.approveConfirm'),
    },
    complete: {
      title: t('appointments.confirm.completeTitle'),
      message: t('appointments.confirm.completeMessage'),
      confirm: t('appointments.confirm.completeConfirm'),
    },
    no_show: {
      title: t('appointments.confirm.noShowTitle'),
      message: t('appointments.confirm.noShowMessage'),
      confirm: t('appointments.confirm.noShowConfirm'),
    },
  }[action];

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      message={copy.message}
      confirm={{
        label: copy.confirm,
        variant: action === 'no_show' ? 'danger' : 'primary',
        loading: mutation.isPending,
        onPress: () =>
          mutation.mutate(
            { appointmentId: appointment.id },
            {
              onSuccess: (result) => {
                if (action === 'complete') {
                  showReviewLink((result as CompletedResult).review_request);
                }
                toast.show({
                  message: t(`appointments.actions.${action === 'no_show' ? 'noShow' : action}`),
                  tone: 'success',
                });
                onClose();
              },
              onError: (error) => {
                toast.show({ message: error.message, tone: 'error' });
                onClose();
              },
            },
          ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  switcher: {
    marginBottom: theme.spacing[12],
  },
  counts: {
    flexDirection: 'row',
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
  countTile: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  body: {
    // No `flex: 1`: this sits inside the scrolling `Screen`, where a flex child
    // cannot grow and only squeezes its own content.
    marginTop: theme.spacing[12],
  },
  skeletonList: {
    gap: theme.spacing[8],
  },
  list: {
    gap: theme.spacing[8],
    paddingBottom: theme.spacing[24],
  },
  row: {
    gap: theme.spacing[8],
    padding: theme.spacing[12],
    borderLeftWidth: 3,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
    minHeight: theme.layout.minTouchTarget,
  },
  rowNext: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  rowTime: {
    width: 64,
    gap: theme.spacing[2],
  },
  rowBody: {
    flex: 1,
    gap: theme.spacing[2],
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[6],
    justifyContent: 'flex-end',
    paddingStart: 64 + theme.spacing[10],
  },
});
