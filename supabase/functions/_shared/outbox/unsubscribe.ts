/**
 * Signed unsubscribe links.
 *
 * A link carries `{ b: business id, c: channel, h: recipient hash, e: expiry }`
 * and an HMAC-SHA256 over it. So a link is bound to ONE business and ONE
 * recipient: it cannot be edited to unsubscribe someone else, and the recipient's
 * address never appears in it (only the keyed hash the database already uses).
 *
 * Verification returns null for a forged, malformed or expired link, and the
 * endpoint answers all of those (and a good link) with the SAME response, so it
 * cannot be used to learn whether a recipient exists.
 *
 * Pure Web Crypto: runs in Deno and in Node (vitest).
 */

export type UnsubPayload = { b: string; c: 'email' | 'sms'; h: string; e: number };

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function toB64Url(text: string): string {
  const bytes = encoder.encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(value: string): string | null {
  try {
    const padded =
      value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', k, encoder.encode(message)));
}

/** Constant-time comparison: a plain === leaks how many leading characters matched. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signUnsubscribe(key: string, payload: UnsubPayload): Promise<string> {
  if (!key) throw new Error('unsubscribe signing key is not set');
  const body = toB64Url(JSON.stringify(payload));
  return `${body}.${await hmacHex(key, body)}`;
}

export async function verifyUnsubscribe(
  key: string,
  token: string | null | undefined,
  nowMs: number,
): Promise<UnsubPayload | null> {
  if (!key || !token || token.length > 1000) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = await hmacHex(key, body);
  if (!timingSafeEqual(expected, sig)) return null;

  const json = fromB64Url(body);
  if (!json) return null;
  let p: unknown;
  try {
    p = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Record<string, unknown>;
  if (
    typeof o.b !== 'string' ||
    (o.c !== 'email' && o.c !== 'sms') ||
    typeof o.h !== 'string' ||
    typeof o.e !== 'number'
  )
    return null;
  if (!/^[0-9a-f]{64}$/.test(o.h)) return null;
  if (o.e < nowMs) return null;
  return { b: o.b, c: o.c, h: o.h, e: o.e };
}
