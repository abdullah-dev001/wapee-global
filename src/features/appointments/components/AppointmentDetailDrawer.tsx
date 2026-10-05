import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/shared';
import { Button, Dialog, Drawer, Text, useToast } from '@/components/ui';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDateTime, type IanaTimeZone, type LocaleTag } from '@/lib/time';

import {
  useApproveAppointment,
  useCancelAppointment,
  type CompletedResult,
  useMarkCompleted,
  useMarkNoShow,
  useReopenAppointment,
} from '../api/useAppointments';
import { useAppointmentInvoices } from '@/features/invoices/api/useAppointmentInvoices';
import { AppointmentInvoiceButton } from '@/features/invoices/components/AppointmentInvoiceButton';
import { ReviewLinkAction } from '@/features/reviews/components/ReviewLinkAction';
import { showReviewLink } from '@/features/reviews/reviewLinkStore';

import { useIsOwnerOrManager } from '../api/useIsOwnerOrManager';
import { actionsForStatus, type AppointmentAction } from '../statusActions';
import { AppointmentRpcError, type AppointmentErrorCode, type AppointmentRow } from '../types';

export type AppointmentDetailDrawerProps = {
  appointment: AppointmentRow | null;
  onClose: () => void;
  timeZone: IanaTimeZone;
  locale: LocaleTag;
};

/** View/act on one appointment: fields, status, and the actions its status + the caller's permissions allow. */
export function AppointmentDetailDrawer({
  appointment,
  onClose,
  timeZone,
  locale,
}: AppointmentDetailDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();

  const canApprove = usePermission('appointments.approve');
  const canCancel = usePermission('appointments.cancel');
  const canEdit = usePermission('appointments.edit');
  // Reopen is Owner/Manager-only by ROLE, not a permission (context/appointments.md).
  // `is_owner_or_manager()` is the SAME function `reopen_appointment` calls
  // internally to gate the action itself, so the button can never show when
  // the RPC would refuse, or hide when it would allow.
  const isOwnerOrManager = useIsOwnerOrManager(businessId, appointment?.branchId ?? null);

  const invoices = useAppointmentInvoices(businessId, appointment ? [appointment.id] : []);
  const linkedInvoiceId = appointment
    ? (invoices.data?.[appointment.id] ?? appointment.invoiceId)
    : null;

  const approve = useApproveAppointment(businessId);
  const cancel = useCancelAppointment(businessId);
  const markCompleted = useMarkCompleted(businessId);
  const markNoShow = useMarkNoShow(businessId);
  const reopen = useReopenAppointment(businessId);

  const [confirmAction, setConfirmAction] = useState<AppointmentAction | null>(null);
  const [actionError, setActionError] = useState<AppointmentErrorCode | null>(null);

  const mutationFor: Record<AppointmentAction, typeof approve> = {
    approve,
    cancel,
    no_show: markNoShow,
    // `complete` also returns the new review link, which the others do not.
    complete: markCompleted as unknown as typeof approve,
    reopen,
  };

  const available = appointment
    ? actionsForStatus(appointment.status).filter((action) => {
        if (action === 'approve') return canApprove.allowed;
        if (action === 'cancel') return canCancel.allowed;
        if (action === 'no_show' || action === 'complete') return canEdit.allowed;
        if (action === 'reopen') return isOwnerOrManager.data === true;
        return false;
      })
    : [];

  const runAction = (action: AppointmentAction) => {
    if (!appointment) return;
    setActionError(null);
    mutationFor[action].mutate(
      { appointmentId: appointment.id },
      {
        onSuccess: (result) => {
          if (action === 'complete') showReviewLink((result as CompletedResult).review_request);
          toast.show({
            message: t(`appointments.actions.${toActionKey(action)}`),
            tone: 'success',
          });
          setConfirmAction(null);
          if (action === 'cancel') onClose();
        },
        onError: (error) => {
          if (error instanceof AppointmentRpcError) {
            setActionError(error.code as AppointmentErrorCode);
          } else {
            toast.show({ message: error.message, tone: 'error' });
          }
          setConfirmAction(null);
        },
      },
    );
  };

  return (
    <>
      <Drawer open={Boolean(appointment)} onClose={onClose} title={t('appointments.detail.title')}>
        {appointment ? (
          <View style={styles.container}>
            <View style={styles.row}>
              <Text variant="label" color="textSecondary">
                {t('appointments.detail.status')}
              </Text>
              <StatusBadge status={appointment.status} />
            </View>

            <DetailRow label={t('appointments.detail.client')} value={appointment.clientName} />
            <DetailRow label={t('appointments.detail.service')} value={appointment.serviceName} />
            {appointment.staffName ? (
              <DetailRow label={t('appointments.detail.staff')} value={appointment.staffName} />
            ) : null}
            <DetailRow
              label={t('appointments.detail.time')}
              value={formatDateTime(appointment.startsAt, timeZone, locale, 'long')}
            />
            {appointment.source ? (
              <DetailRow
                label={t('appointments.detail.source')}
                value={t(`appointments.source.${appointment.source}`)}
              />
            ) : null}

            {actionError ? (
              <Text variant="helper" color="error">
                {t(`appointments.errors.${actionError}`)}
              </Text>
            ) : null}

            {appointment.status === 'completed' ? (
              <AppointmentInvoiceButton
                businessId={businessId}
                appointmentId={appointment.id}
                invoiceId={linkedInvoiceId}
                onNavigate={onClose}
              />
            ) : null}

            <ReviewLinkAction
              businessId={businessId}
              appointmentId={appointment.id}
              status={appointment.status}
            />

            {available.length > 0 ? (
              <View style={styles.actions}>
                {available.map((action) => (
                  <Button
                    key={action}
                    variant={action === 'cancel' ? 'danger' : 'secondary'}
                    onPress={() => setConfirmAction(action)}
                    loading={mutationFor[action].isPending}
                  >
                    {t(`appointments.actions.${toActionKey(action)}`)}
                  </Button>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Drawer>

      <Dialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction ? t(CONFIRM_KEYS[confirmAction].title) : ''}
        message={confirmAction ? t(CONFIRM_KEYS[confirmAction].message) : ''}
        confirm={
          confirmAction
            ? {
                label: t(CONFIRM_KEYS[confirmAction].confirm),
                variant: confirmAction === 'cancel' ? 'danger' : 'primary',
                onPress: () => runAction(confirmAction),
                loading: mutationFor[confirmAction].isPending,
              }
            : undefined
        }
      />
    </>
  );
}

function toActionKey(
  action: AppointmentAction,
): 'approve' | 'cancel' | 'complete' | 'noShow' | 'reopen' {
  if (action === 'no_show') return 'noShow';
  return action;
}

type ConfirmKey = 'approve' | 'cancel' | 'noShow' | 'complete' | 'reopen';

const CONFIRM_KEYS: Record<
  AppointmentAction,
  {
    title: `appointments.confirm.${ConfirmKey}Title`;
    message: `appointments.confirm.${ConfirmKey}Message`;
    confirm: `appointments.confirm.${ConfirmKey}Confirm`;
  }
> = {
  approve: {
    title: 'appointments.confirm.approveTitle',
    message: 'appointments.confirm.approveMessage',
    confirm: 'appointments.confirm.approveConfirm',
  },
  cancel: {
    title: 'appointments.confirm.cancelTitle',
    message: 'appointments.confirm.cancelMessage',
    confirm: 'appointments.confirm.cancelConfirm',
  },
  no_show: {
    title: 'appointments.confirm.noShowTitle',
    message: 'appointments.confirm.noShowMessage',
    confirm: 'appointments.confirm.noShowConfirm',
  },
  complete: {
    title: 'appointments.confirm.completeTitle',
    message: 'appointments.confirm.completeMessage',
    confirm: 'appointments.confirm.completeConfirm',
  },
  reopen: {
    title: 'appointments.confirm.reopenTitle',
    message: 'appointments.confirm.reopenMessage',
    confirm: 'appointments.confirm.reopenConfirm',
  },
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[16],
  },
  row: {
    gap: theme.spacing[4],
  },
  actions: {
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
});
