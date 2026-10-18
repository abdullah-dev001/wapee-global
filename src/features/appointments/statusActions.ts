import { type Database } from '@/lib/supabase/database.types';

/**
 * Status -> available-action mapping, mirroring the DB's
 * `appointment_status_transitions` / `is_allowed_appointment_transition`
 * (context/appointments.md) for the UI's hide/disable decision. **This is
 * NOT the boundary** (CLAUDE.md §7): the RPC re-checks everything and is the
 * real refusal. Getting this wrong only shows/hides a button wrongly; it can
 * never let an unauthorised action through, because the RPC itself checks
 * `can()` / the role / `invoice_id` again.
 */
export type AppointmentStatus = Database['public']['Enums']['appointment_status'];

export type AppointmentAction = 'approve' | 'cancel' | 'no_show' | 'complete' | 'reopen';

export type ActionAvailability = {
  /** Owner/Manager-only, outside the normal permission catalogue. */
  roleOnly?: true;
  /** `appointments.<x>` permission key this action needs, if not role-only. */
  permission?: 'appointments.approve' | 'appointments.cancel' | 'appointments.edit';
};

const AVAILABILITY: Record<AppointmentAction, ActionAvailability> = {
  approve: { permission: 'appointments.approve' },
  cancel: { permission: 'appointments.cancel' },
  no_show: { permission: 'appointments.edit' },
  complete: { permission: 'appointments.edit' },
  reopen: { roleOnly: true },
};

/**
 * Actions a status can move to, independent of permission — matches the DB
 * table exactly, including that `cancelled` has no outgoing transition at
 * all (permanently terminal).
 */
const STATUS_ACTIONS: Record<AppointmentStatus, AppointmentAction[]> = {
  pending: ['approve', 'cancel'],
  confirmed: ['cancel', 'complete', 'no_show'],
  completed: ['reopen'],
  no_show: ['reopen'],
  cancelled: [],
};

/** True when `status` can move to `action` at all (before any permission check). */
export function isActionAvailableForStatus(
  status: AppointmentStatus,
  action: AppointmentAction,
): boolean {
  return STATUS_ACTIONS[status].includes(action);
}

/** Every action a status could offer, for building the list of buttons to show/disable. */
export function actionsForStatus(status: AppointmentStatus): AppointmentAction[] {
  return STATUS_ACTIONS[status];
}

export function availabilityFor(action: AppointmentAction): ActionAvailability {
  return AVAILABILITY[action];
}

/** True when a terminal row (`cancelled`) can never move again. */
export function isTerminalStatus(status: AppointmentStatus): boolean {
  return STATUS_ACTIONS[status].length === 0;
}

/**
 * Time rule on top of the status rules (QA F11). A no-show cannot be known
 * before the appointment starts, so it is not offered (the RPC refuses it too,
 * `not_started`). Completing early stays possible (a client seen early, a
 * walk-in) but the confirm dialog warns: `early`.
 */
export type ActionTimeGate = 'ok' | 'hidden' | 'early';

export function actionTimeGate(
  action: AppointmentAction,
  startsAt: string,
  now: Date = new Date(),
): ActionTimeGate {
  const started = now.getTime() >= new Date(startsAt).getTime();
  if (started) return 'ok';
  if (action === 'no_show') return 'hidden';
  if (action === 'complete') return 'early';
  return 'ok';
}
