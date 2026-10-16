import { type AppointmentAction } from './statusActions';

/** i18n key fragments for the detail drawer's status actions and their confirm dialogs. */

export function toActionKey(
  action: AppointmentAction,
): 'approve' | 'cancel' | 'complete' | 'noShow' | 'reopen' {
  if (action === 'no_show') return 'noShow';
  return action;
}

type ConfirmKey = 'approve' | 'cancel' | 'noShow' | 'complete' | 'reopen';

export const CONFIRM_KEYS: Record<
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
