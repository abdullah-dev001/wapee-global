import { can } from '@/lib/permissions/can';
import { type GrantSet } from '@/lib/permissions/types';
import {
  formatMinuteOfDay,
  parseMinuteOfDay,
  utcToZoned,
  zonedToUtc,
  type IanaTimeZone,
  type LocalDate,
  type MinuteOfDay,
  type UtcIso,
} from '@/lib/time';

import { type AppointmentRow, type AppointmentStatus } from './types';

/**
 * Pure rules for the dashboard "Reschedule" action. The RPC
 * (`update_appointment`) is the boundary: it re-checks the permission and scope,
 * refuses terminal statuses (`not_editable`), runs the collision check with the
 * appointment's own row excluded, and applies the buffer. Nothing here decides
 * availability; it only decides what to show and what to send.
 */

/** Only a live booking can move. Mirrors `update_appointment`'s `not_editable`. */
const RESCHEDULABLE: ReadonlySet<AppointmentStatus> = new Set(['pending', 'confirmed']);

export function canRescheduleStatus(status: AppointmentStatus): boolean {
  return RESCHEDULABLE.has(status);
}

/**
 * How far the caller may move appointments at this branch:
 * - `branch`: any appointment at the branch, to any eligible staff member
 * - `own`: only their own appointments, and the staff member stays themselves
 * - `none`: no button
 *
 * Mirrors SQL `can(...'appointments.edit')` + `has_permission_at_branch_scope()`
 * (a Branch- or All-scope grant that covers this branch).
 */
export type RescheduleScope = 'none' | 'own' | 'branch';

export function rescheduleScope(set: GrantSet, branchId: string): RescheduleScope {
  if (!can(set, 'appointments.edit', branchId)) return 'none';
  if (set.isSuperAdmin) return 'branch';
  const branchWide = set.grants.some(
    (grant) =>
      grant.permission === 'appointments.edit' &&
      (grant.scope === 'all' ||
        (grant.scope === 'branch' && (grant.branchId === null || grant.branchId === branchId))),
  );
  return branchWide ? 'branch' : 'own';
}

/** Whether the Reschedule button shows for this appointment and caller. */
export function canShowReschedule(
  appointment: Pick<AppointmentRow, 'status' | 'staffId'>,
  scope: RescheduleScope,
  myStaffProfileId: string | null,
): boolean {
  if (!canRescheduleStatus(appointment.status)) return false;
  if (scope === 'branch') return true;
  if (scope === 'own') {
    return appointment.staffId !== null && appointment.staffId === myStaffProfileId;
  }
  return false;
}

export type RescheduleValues = {
  /** Wall-clock date in the BRANCH timezone. */
  date: LocalDate;
  /** Minute of day in the BRANCH timezone. */
  minute: MinuteOfDay;
  staffId: string | null;
};

/** The form's starting point: the appointment's current slot, seen in the branch timezone. */
export function initialRescheduleValues(
  appointment: Pick<AppointmentRow, 'startsAt' | 'staffId'>,
  timeZone: IanaTimeZone,
): RescheduleValues {
  const { date, time } = utcToZoned(appointment.startsAt, timeZone);
  return { date, minute: parseMinuteOfDay(time) ?? 0, staffId: appointment.staffId };
}

export type RescheduleInput = { startsAt?: UtcIso; staffId?: string };

/**
 * What to send to `update_appointment`, or `null` when nothing changed (the
 * Save button stays disabled). Only changed fields are sent: the RPC treats a
 * missing value as "leave unchanged".
 */
export function rescheduleInput(
  appointment: Pick<AppointmentRow, 'startsAt' | 'staffId'>,
  values: RescheduleValues,
  timeZone: IanaTimeZone,
): RescheduleInput | null {
  const startsAt = zonedToUtc(values.date, formatMinuteOfDay(values.minute), timeZone);
  const input: RescheduleInput = {};
  if (new Date(startsAt).getTime() !== new Date(appointment.startsAt).getTime()) {
    input.startsAt = startsAt;
  }
  if (values.staffId && values.staffId !== appointment.staffId) {
    input.staffId = values.staffId;
  }
  return input.startsAt || input.staffId ? input : null;
}

/**
 * Staff who can take this service at this branch. `update_appointment` refuses
 * anyone else (`staff_unavailable`), so they are not offered. The current staff
 * member always stays in the list so the picker can show the existing choice.
 */
export function eligibleStaff<
  T extends { id: string; branchIds: string[]; serviceIds: string[]; isActive?: boolean },
>(staff: readonly T[], serviceId: string, branchId: string, currentStaffId: string | null): T[] {
  return staff.filter(
    (member) =>
      member.id === currentStaffId ||
      (member.isActive !== false &&
        member.serviceIds.includes(serviceId) &&
        member.branchIds.includes(branchId)),
  );
}
