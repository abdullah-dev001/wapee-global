/**
 * Maps a Supabase/Postgrest error from a clients read or write to an i18n key,
 * so no Clients screen shows raw server text (CLAUDE.md: zero hard-coded user
 * strings). Same reason-code pattern as `serviceErrorKey`: branches on the
 * stable SQLSTATE `code`, never the message.
 */

export const CLIENT_ERROR_KEYS = {
  duplicatePhone: 'clients.errors.duplicatePhone',
  forbidden: 'clients.errors.forbidden',
  invalidInput: 'clients.errors.invalidInput',
  unknown: 'clients.errors.unknown',
} as const;

export type ClientErrorKey = (typeof CLIENT_ERROR_KEYS)[keyof typeof CLIENT_ERROR_KEYS];

function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function clientErrorKey(error: unknown): ClientErrorKey {
  switch (sqlStateOf(error)) {
    // unique_violation: the phone number already belongs to another client.
    case '23505':
      return CLIENT_ERROR_KEYS.duplicatePhone;
    // insufficient_privilege: RLS / column grant refused.
    case '42501':
      return CLIENT_ERROR_KEYS.forbidden;
    // check_violation / not_null_violation / string too long.
    case '23514':
    case '23502':
    case '22001':
      return CLIENT_ERROR_KEYS.invalidInput;
    default:
      return CLIENT_ERROR_KEYS.unknown;
  }
}
