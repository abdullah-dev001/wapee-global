/**
 * Maps a Supabase/Postgrest error from a services or categories write to an
 * i18n key, so neither screen ever shows raw server text (CLAUDE.md: zero
 * hard-coded user strings). Same reason-code pattern as `roleErrorKey` /
 * `inviteMemberErrorKey`: branches on the stable `code`, never the message.
 */

export const SERVICE_ERROR_KEYS = {
  duplicateName: 'services.errors.duplicateName',
  forbidden: 'services.errors.forbidden',
  inUse: 'services.errors.inUse',
  invalidInput: 'services.errors.invalidInput',
  unknown: 'services.errors.unknown',
} as const;

export type ServiceErrorKey = (typeof SERVICE_ERROR_KEYS)[keyof typeof SERVICE_ERROR_KEYS];

type ErrorLike = { code?: string | null };

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  return (error as ErrorLike).code ?? null;
}

export function serviceErrorKey(error: unknown): ServiceErrorKey {
  switch (codeOf(error)) {
    case '23505':
      return SERVICE_ERROR_KEYS.duplicateName;
    case '42501':
      return SERVICE_ERROR_KEYS.forbidden;
    // FK restrict: a hard delete was refused because appointments or invoice
    // lines still point at this row. The app only ever soft-deletes, but the
    // code path exists at the database level and must not leak raw text.
    case '23503':
      return SERVICE_ERROR_KEYS.inUse;
    case '23514':
      return SERVICE_ERROR_KEYS.invalidInput;
    default:
      return SERVICE_ERROR_KEYS.unknown;
  }
}

export const CATEGORY_ERROR_KEYS = {
  duplicateName: 'services.categories.errors.duplicateName',
  forbidden: 'services.categories.errors.forbidden',
  invalidInput: 'services.categories.errors.invalidInput',
  unknown: 'services.categories.errors.unknown',
} as const;

export type CategoryErrorKey = (typeof CATEGORY_ERROR_KEYS)[keyof typeof CATEGORY_ERROR_KEYS];

export function categoryErrorKey(error: unknown): CategoryErrorKey {
  switch (codeOf(error)) {
    case '23505':
      return CATEGORY_ERROR_KEYS.duplicateName;
    case '42501':
      return CATEGORY_ERROR_KEYS.forbidden;
    case '23514':
      return CATEGORY_ERROR_KEYS.invalidInput;
    default:
      return CATEGORY_ERROR_KEYS.unknown;
  }
}
