/**
 * The signed embed token for the booking widget.
 *
 * Issued by `validate_widget` after the database confirmed that the browser's
 * `Origin` is on the key's allow-list. Bound to the slug AND the origin, and it
 * EXPIRES (1 hour). Format: `<expires_ms>.<slug>.<base64url(origin)>.<hmac>`.
 *
 * The signed message carries an `embed:` prefix, so a booking start token (also
 * four dot-separated parts, signed with the same key) can never be replayed as
 * an embed token, nor the reverse.
 *
 * WHAT THIS IS NOT: it does not stop a page from being framed. Only the
 * `Content-Security-Policy: frame-ancestors` header on the booking page does
 * (see context/website-reviews-widget.md, launch blocker). This token lets the
 * framed page (a) prove it was handed out for the origin that is framing it and
 * (b) be told, by the server, whether that origin is still allowed.
 */

import { EMBED_TOKEN } from './config.ts';
import { hmacHex, timingSafeEqual } from './crypto.ts';

function b64url(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(value: string): string | null {
  try {
    const padded =
      value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** Canonical form of an origin: lower-case scheme://host[:port], no trailing slash. */
export function normaliseOrigin(origin: string): string | null {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export async function issueEmbedToken(slug: string, origin: string): Promise<string> {
  const expires = Date.now() + EMBED_TOKEN.ttlSeconds * 1000;
  const originPart = b64url(origin);
  const payload = `${expires}.${slug}.${originPart}`;
  return `${payload}.${await hmacHex(`embed:${payload}`)}`;
}

/** Returns the origin the token was issued for, or null for ANY failure. */
export async function verifyEmbedToken(
  token: string | null | undefined,
  slug: string,
): Promise<string | null> {
  if (!token || typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [expiresRaw, tokenSlug, originPart, signature] = parts as [string, string, string, string];

  const expected = await hmacHex(`embed:${expiresRaw}.${tokenSlug}.${originPart}`);
  if (!timingSafeEqual(signature, expected)) return null;
  if (tokenSlug !== slug) return null;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;

  return fromB64url(originPart);
}
