/**
 * Client-side checks for website images. The server limits (bucket size/type,
 * storage policy) still apply and are the real boundary; these only give an
 * immediate, friendly refusal. PURE.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const EXT_BY_TYPE: Record<(typeof ALLOWED_IMAGE_TYPES)[number], 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type ImageProblem = 'type' | 'size' | 'unknown_size';

/**
 * Null when acceptable. A picker that cannot report the size is refused rather
 * than guessed (`unknown_size`): an oversize file would only fail later, after
 * the upload started.
 */
export function imageProblem(input: {
  mimeType: string | null | undefined;
  fileSize: number | null | undefined;
}): ImageProblem | null {
  const type = (input.mimeType ?? '').toLowerCase();
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) return 'type';
  if (typeof input.fileSize !== 'number' || !Number.isFinite(input.fileSize)) return 'unknown_size';
  if (input.fileSize > MAX_IMAGE_BYTES) return 'size';
  return null;
}

export function extensionFor(mimeType: string): 'jpg' | 'png' | 'webp' | null {
  return EXT_BY_TYPE[mimeType.toLowerCase() as keyof typeof EXT_BY_TYPE] ?? null;
}

/** RFC 4122 v4 from a random source (injectable for tests). */
export function uuidV4(random: () => number = Math.random): string {
  const hex = (n: number) => Math.floor(random() * n).toString(16);
  const part = (len: number) => Array.from({ length: len }, () => hex(16)).join('');
  return `${part(8)}-${part(4)}-4${part(3)}-${(8 + Math.floor(random() * 4)).toString(16)}${part(3)}-${part(12)}`;
}

/** `<business uuid>/<file uuid>.<ext>` — the only shape the storage policy accepts. */
export function assetPath(
  businessId: string,
  mimeType: string,
  uuid: string = uuidV4(),
): string | null {
  const ext = extensionFor(mimeType);
  return ext ? `${businessId}/${uuid}.${ext}` : null;
}

/** Public URL of an asset in the website-assets bucket. */
export function assetPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/website-assets/${path}`;
}
