import { AppointmentRpcError, type AppointmentErrorCode } from './types';

/**
 * Maps any error from an appointments read or write to an i18n key, so no
 * Calendar / Today / list screen ever shows raw server text (CLAUDE.md: zero
 * hard-coded user strings). Same reason-code pattern as `serviceErrorKey`:
 * branches on the stable `code`, never the message.
 *
 * - `{ok:false, code}` from a write RPC arrives as `AppointmentRpcError`.
 * - A Postgrest/Postgres error keeps its SQLSTATE `code` (the api layer
 *   rethrows the original error rather than `new Error(message)`).
 */

export type AppointmentErrorKey = `appointments.errors.${AppointmentErrorCode | 'unknown'}`;

const KNOWN_CODES: ReadonlySet<AppointmentErrorCode> = new Set<AppointmentErrorCode>([
  'forbidden',
  'not_found',
  'unknown_service',
  'service_unavailable',
  'unknown_client',
  'invalid_name',
  'invalid_phone',
  'invalid_email',
  'staff_unavailable',
  'no_staff',
  'slot_unavailable',
  'slot_taken',
  'no_resource',
  'not_editable',
  'invalid_transition',
  'invoiced',
  'not_started',
]);

function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function appointmentErrorKey(error: unknown): AppointmentErrorKey {
  if (error instanceof AppointmentRpcError) {
    return error.code !== 'unknown' && KNOWN_CODES.has(error.code)
      ? `appointments.errors.${error.code}`
      : 'appointments.errors.unknown';
  }
  switch (sqlStateOf(error)) {
    // insufficient_privilege: RLS / EXECUTE refused.
    case '42501':
      return 'appointments.errors.forbidden';
    // exclusion_violation: the no-double-booking constraint was the backstop.
    case '23P01':
      return 'appointments.errors.slot_unavailable';
    default:
      return 'appointments.errors.unknown';
  }
}
