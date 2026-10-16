/**
 * Maps a Supabase/Postgrest error from a schedule write (staff hours, breaks,
 * time off, branch hours, closures, resources) to an i18n key, so no schedule
 * screen ever shows raw server text (CLAUDE.md: zero hard-coded user strings).
 * Same reason-code pattern as `serviceErrorKey` / `roleErrorKey`.
 *
 * The `replace_*` RPCs raise plain Postgres exceptions (not the `{ok:false,
 * code}` convention), so the caller sees these on the Postgrest error's own
 * `.code` either way — a direct table write and an RPC call land here the same.
 */

export const SCHEDULE_ERROR_KEYS = {
  overlap: 'schedule.errors.overlap',
  invalidInterval: 'schedule.errors.invalidInterval',
  duplicateName: 'schedule.errors.duplicateName',
  forbidden: 'schedule.errors.forbidden',
  invalidInput: 'schedule.errors.invalidInput',
  unknown: 'schedule.errors.unknown',
} as const;

export type ScheduleErrorKey = (typeof SCHEDULE_ERROR_KEYS)[keyof typeof SCHEDULE_ERROR_KEYS];

type ErrorLike = { code?: string | null };

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  return (error as ErrorLike).code ?? null;
}

export function scheduleErrorKey(error: unknown): ScheduleErrorKey {
  switch (codeOf(error)) {
    // Exclusion constraint: an overlapping interval (hours/breaks/time off) or
    // an overlapping closure.
    case '23P01':
      return SCHEDULE_ERROR_KEYS.overlap;
    // CHECK constraint: overnight/zero-length interval, or an invalid date
    // range on a closure.
    case '23514':
      return SCHEDULE_ERROR_KEYS.invalidInterval;
    // Unique constraint: a resource name already used at this branch.
    case '23505':
      return SCHEDULE_ERROR_KEYS.duplicateName;
    case '42501':
      return SCHEDULE_ERROR_KEYS.forbidden;
    // The replace_* RPCs raise this for an unknown staff member or branch.
    case '22023':
      return SCHEDULE_ERROR_KEYS.invalidInput;
    default:
      return SCHEDULE_ERROR_KEYS.unknown;
  }
}

const RESOURCE_ARCHIVE_ERROR_KEYS = {
  future_appointments: 'schedule.resourceArchiveErrors.futureAppointments',
  not_found: 'schedule.resourceArchiveErrors.notFound',
  forbidden: 'schedule.resourceArchiveErrors.forbidden',
} as const;

/**
 * i18n key for a code returned by `archive_resource` (the `{ok:false,code}`
 * convention via `RpcError`, a different code space than the Postgres
 * SQLSTATEs `scheduleErrorKey` handles), or null for anything else.
 */
export function resourceArchiveErrorKey(
  error: unknown,
): (typeof RESOURCE_ARCHIVE_ERROR_KEYS)[keyof typeof RESOURCE_ARCHIVE_ERROR_KEYS] | null {
  const code = codeOf(error);
  if (code && code in RESOURCE_ARCHIVE_ERROR_KEYS) {
    return RESOURCE_ARCHIVE_ERROR_KEYS[code as keyof typeof RESOURCE_ARCHIVE_ERROR_KEYS];
  }
  return null;
}
