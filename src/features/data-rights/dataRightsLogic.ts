/** Pure helpers for the data-rights screens (tested). */

/** Reason codes the erase / export functions can answer with, mapped to i18n keys. Unknown codes fall back. */
export const DATA_RIGHTS_ERROR_KEYS = {
  has_future_appointment: 'dataRights.errors.has_future_appointment',
  has_draft_invoice: 'dataRights.errors.has_draft_invoice',
  name_mismatch: 'dataRights.errors.name_mismatch',
  storage_not_clean: 'dataRights.errors.storage_not_clean',
  not_found: 'dataRights.errors.not_found',
  forbidden: 'dataRights.errors.forbidden',
  already_resolved: 'dataRights.errors.already_resolved',
  unknown: 'dataRights.errors.unknown',
} as const;

export type DataRightsErrorKey =
  (typeof DATA_RIGHTS_ERROR_KEYS)[keyof typeof DATA_RIGHTS_ERROR_KEYS];

export function dataRightsErrorKey(code: string | null | undefined): DataRightsErrorKey {
  if (code && Object.prototype.hasOwnProperty.call(DATA_RIGHTS_ERROR_KEYS, code)) {
    return DATA_RIGHTS_ERROR_KEYS[code as keyof typeof DATA_RIGHTS_ERROR_KEYS];
  }
  return DATA_RIGHTS_ERROR_KEYS.unknown;
}

/** Typed confirmation: trimmed, spaces collapsed, case-insensitive ("Erin  Eraseme " matches "erin eraseme"). */
export function namesMatch(typed: string, expected: string): boolean {
  const clean = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
  const want = clean(expected);
  return want.length > 0 && clean(typed) === want;
}

export type RequestStatus = 'open' | 'done' | 'declined';
export type RequestKind = 'export' | 'erase';

export function statusTone(status: RequestStatus): 'warning' | 'success' | 'neutral' {
  if (status === 'open') return 'warning';
  if (status === 'done') return 'success';
  return 'neutral';
}

export type RequestPermissions = { canExport: boolean; canErase: boolean };

/** What the signed-in person may do with a request of this kind (the database re-checks every one). */
export function requestAbilities(kind: RequestKind, perms: RequestPermissions) {
  return {
    canRun: kind === 'export' ? perms.canExport : perms.canErase,
    canDecline: kind === 'export' ? perms.canExport : perms.canErase,
  };
}
