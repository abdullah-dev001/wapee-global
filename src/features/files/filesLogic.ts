/**
 * Pure rules for Files & Photos. The database and the `client_files` Edge Function decide everything
 * (type by the first bytes, size, consent, scope, add-on); these helpers only give a quick, friendly
 * refusal before an upload and map error codes to messages.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, 'application/pdf'] as const;
export type AllowedMime = (typeof ALLOWED_MIMES)[number];

export const PHOTO_CATEGORIES = ['before', 'after', 'damage', 'other'] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];
export type FileCategory = PhotoCategory | 'document';

export function isImageMime(mime: string): boolean {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime);
}

export type PickProblem = 'unsupported_type' | 'file_too_large' | 'invalid_size';

/** A quick check from what the picker reported; the server re-checks the real bytes. */
export function pickProblem(input: {
  mime: string | null | undefined;
  size: number | null | undefined;
}): PickProblem | null {
  const mime = (input.mime ?? '').toLowerCase();
  if (mime && !(ALLOWED_MIMES as readonly string[]).includes(mime)) return 'unsupported_type';
  if (input.size !== null && input.size !== undefined) {
    if (input.size < 1) return 'invalid_size';
    if (input.size > MAX_FILE_BYTES) return 'file_too_large';
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FILE_ERROR_KEYS = {
  forbidden: 'files.errors.forbidden',
  feature_unavailable: 'files.errors.feature_unavailable',
  not_found: 'files.errors.not_found',
  unsupported_type: 'files.errors.unsupported_type',
  file_too_large: 'files.errors.file_too_large',
  invalid_size: 'files.errors.invalid_size',
  invalid_name: 'files.errors.invalid_name',
  invalid_category: 'files.errors.invalid_category',
  appointment_mismatch: 'files.errors.appointment_mismatch',
  photo_consent_required: 'files.errors.photo_consent_required',
  file_cap_reached: 'files.errors.file_cap_reached',
  file_rejected: 'files.errors.file_rejected',
  invalid_value: 'files.errors.invalid_value',
  upload_failed: 'files.errors.upload_failed',
  unknown: 'files.errors.unknown',
} as const;

export type FileErrorCode = keyof typeof FILE_ERROR_KEYS;

export function fileErrorKey(code: string | null): (typeof FILE_ERROR_KEYS)[FileErrorCode] {
  if (code && Object.prototype.hasOwnProperty.call(FILE_ERROR_KEYS, code)) {
    return FILE_ERROR_KEYS[code as FileErrorCode];
  }
  return FILE_ERROR_KEYS.unknown;
}

/** Thrown by the upload / url calls: carries the server's code. */
export class FilesApiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'FilesApiError';
    this.code = code;
  }
}
