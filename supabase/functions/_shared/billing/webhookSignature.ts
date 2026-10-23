/**
 * Standard Webhooks signature check (Polar endpoints whose secret was generated on or after
 * 2026-09-08 use this scheme). Pure Web Crypto, no SDK (founder decision 2026-10-23).
 *
 *   signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`
 *   key            = base64-decoded part of the secret after `whsec_`
 *   header         = space-separated `v1,<base64 HMAC-SHA256>` entries (any one may match)
 *
 * A timestamp more than 5 minutes from now is refused (replay window). Comparison is constant-time.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacBase64(keyBytes: Uint8Array<ArrayBuffer>, content: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content));
  return bytesToBase64(new Uint8Array(sig));
}

function secretKey(secret: string): Uint8Array<ArrayBuffer> | null {
  if (!secret.startsWith('whsec_')) return null;
  const key = base64ToBytes(secret.slice('whsec_'.length));
  return key && key.length > 0 ? key : null;
}

/** The `v1,<sig>` header value for a payload (tests, and a local replay tool). */
export async function signWebhook(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const key = secretKey(secret);
  if (!key) throw new Error('invalid webhook secret');
  return `v1,${await hmacBase64(key, `${id}.${timestamp}.${body}`)}`;
}

export async function verifyWebhook(
  secret: string,
  headers: WebhookHeaders,
  body: string,
  nowSeconds: number,
): Promise<boolean> {
  const key = secretKey(secret);
  const { id, timestamp, signature } = headers;
  if (!key || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = await hmacBase64(key, `${id}.${timestamp}.${body}`);
  return signature
    .split(' ')
    .map((part) => part.trim())
    .some((part) => part.startsWith('v1,') && timingSafeEqual(part.slice(3), expected));
}
