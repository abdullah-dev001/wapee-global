import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/shared';
import { Button, Dialog, Drawer, Text, useToast } from '@/components/ui';
import { useCurrentScope, useGrantSet, usePermission } from '@/lib/permissions';
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
import { ClientFilesSection } from '@/features/files/components/ClientFilesSection';
import { AppointmentFormsSection } from '@/features/forms/components/AppointmentFormsSection';
import { AppointmentPackageSection } from '@/features/packages/components/AppointmentPackageSection';
import { AppointmentMessages } from '@/features/notifications/components/AppointmentMessages';
import { ReviewLinkAction } from '@/features/reviews/components/ReviewLinkAction';
import { showReviewLink } from '@/features/reviews/reviewLinkStore';

import { AppointmentAnswersSection } from './AppointmentAnswersSection';
import { AppointmentClientContact } from './AppointmentClientContact';
import { DetailRow } from './DetailRow';
import { RescheduleForm } from './RescheduleForm';
import { CONFIRM_KEYS, toActionKey } from '../actionKeys';
import { useIsOwnerOrManager } from '../api/useIsOwnerOrManager';
import { useMyStaffProfile } from '../api/useMyStaffProfile';
import { appointmentErrorKey, type AppointmentErrorKey } from '../appointmentErrorKey';
import { canShowReschedule, rescheduleScope } from '../reschedule';
import { actionTimeGate, actionsForStatus, type AppointmentAction } from '../statusActions';
import { type AppointmentRow } from '../types';

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
  const { set: grantSet } = useGrantSet();
  const myStaffProfile = useMyStaffProfile(businessId);
  const moveScope =
    appointment && grantSet ? rescheduleScope(grantSet, appointment.branchId) : 'none';
  const showReschedule =
    appointment !== null && canShowReschedule(appointment, moveScope, myStaffProfile.data ?? null);

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
  const [actionError, setActionError] = useState<AppointmentErrorKey | null>(null);
  // The reschedule form replaces the details inside the same drawer; keyed by id
  // so opening another appointment always starts on its details.
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const isRescheduling = appointment !== null && rescheduleId === appointment.id;
  // Close (button, scrim, Escape, Android back) leaves the form first, then the drawer.
  const handleClose = () => {
    if (isRescheduling) setRescheduleId(null);
    else onClose();
  };

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
        if (action === 'no_show' || action === 'complete') {
          // No no-show before the start (QA F11); the RPC refuses it too.
          return canEdit.allowed && actionTimeGate(action, appointment.startsAt) !== 'hidden';
        }
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
          setActionError(appointmentErrorKey(error));
          setConfirmAction(null);
        },
      },
    );
  };

  return (
    <>
      <Drawer
        open={Boolean(appointment)}
        onClose={handleClose}
        title={t(isRescheduling ? 'appointments.reschedule.title' : 'appointments.detail.title')}
      >
        {appointment && isRescheduling && moveScope !== 'none' ? (
          <RescheduleForm
            appointment={appointment}
            scope={moveScope}
            timeZone={timeZone}
            locale={locale}
            onCancel={() => setRescheduleId(null)}
            onDone={() => {
              setRescheduleId(null);
              // The row passed in still holds the old time: close rather than show stale data.
              onClose();
            }}
          />
        ) : appointment ? (
          <View style={styles.container}>
            <View style={styles.row}>
              <Text variant="label" color="textSecondary">
                {t('appointments.detail.status')}
              </Text>
              <StatusBadge status={appointment.status} />
            </View>

            <DetailRow label={t('appointments.detail.client')} value={appointment.clientName} />
            <AppointmentClientContact clientId={appointment.clientId} onNavigate={onClose} />
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

            <AppointmentAnswersSection appointmentId={appointment.id} />

            {actionError ? (
              <Text variant="helper" color="error">
                {t(actionError)}
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

            {/* Add-on "Packages & Sessions": balance + use/undo a session (hidden when the add-on is off). */}
            <AppointmentPackageSection
              appointmentId={appointment.id}
              branchId={appointment.branchId}
              clientId={appointment.clientId}
              serviceId={appointment.serviceId}
              status={appointment.status}
            />

            {/* Add-ons Forms & Consent / Files & Photos: each hidden while off. */}
            <AppointmentFormsSection
              appointmentId={appointment.id}
              clientId={appointment.clientId}
              clientName={appointment.clientName}
            />
            <ClientFilesSection clientId={appointment.clientId} appointmentId={appointment.id} />

            {/* "Did the customer get a message?" (branch-scope viewers only). */}
            <AppointmentMessages
              appointmentId={appointment.id}
              timezone={timeZone}
              enabled={appointment.source !== 'walk_in'}
            />

            <ReviewLinkAction
              businessId={businessId}
              appointmentId={appointment.id}
              status={appointment.status}
            />

            {available.length > 0 || showReschedule ? (
              <View style={styles.actions}>
                {showReschedule ? (
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setActionError(null);
                      setRescheduleId(appointment.id);
                    }}
                  >
                    {t('appointments.detail.reschedule')}
                  </Button>
                ) : null}
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
        message={
          confirmAction === 'complete' &&
          appointment &&
          actionTimeGate('complete', appointment.startsAt) === 'early'
            ? t('appointments.confirm.completeEarlyMessage')
            : confirmAction
              ? t(CONFIRM_KEYS[confirmAction].message)
              : ''
        }
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
