/**
 * Server-side file-type check (Files & Photos). The browser's declared type and the file name are
 * never trusted: the first bytes of the stored object decide. Pure: no Deno, no I/O (vitest).
 *
 * Only the four allowed kinds exist; anything else (HEIC, SVG, GIF, an executable renamed .jpg)
 * returns null, which makes the upload `rejected`.
 */

export type DetectedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const startsWith = (b: Uint8Array, sig: number[], offset = 0): boolean =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

export function detectMime(bytes: Uint8Array): DetectedMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // WEBP = "RIFF" <4 size bytes> "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  // PDF = "%PDF-"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/** Total object size from a `Content-Range: bytes 0-31/12345` header (null when unknown). */
export function totalFromContentRange(header: string | null): number | null {
  if (!header) return null;
  const m = /\/(\d+)$/.exec(header.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** A signed-URL lifetime in seconds, clamped: short by design (2 s for tests, 300 s at most). */
export function clampTtl(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 300;
  return Math.max(2, Math.min(300, n));
}
