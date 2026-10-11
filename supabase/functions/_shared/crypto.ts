/**
 * Hashing and HMAC for the public endpoints. Web Crypto only, no dependency.
 */

import { SECRET_NAMES } from './config.ts';

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A required secret, or a thrown configuration error (never a silent fallback). */
function requireSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value || value.trim().length === 0) {
    // Thrown, not defaulted. A missing salt must not silently become a constant
    // salt — that would make every IP hash guessable.
    throw new Error(`${name} is not set`);
  }
  return value;
}

/**
 * sha256(salt || value), hex.
 *
 * Used for the stored IP hash and the per-phone rate-limit key. A plain sha256
 * of an IP would be trivially reversible by hashing the whole IPv4 space, which
 * is why the salt is not optional.
 */
export async function hashWithSalt(value: string): Promise<string> {
  const salt = requireSecret(SECRET_NAMES.ipHashSalt);
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${value}`));
  return toHex(digest);
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(requireSecret(SECRET_NAMES.formHmacKey)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function hmacHex(message: string): Promise<string> {
  const key = await hmacKey();
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/**
 * Constant-time string comparison.
 *
 * `a === b` on a signature leaks, through timing, how many leading characters
 * matched, which is enough to forge one byte at a time. Comparing every
 * character regardless removes that signal.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** 32 bytes of CSPRNG as hex: 256 bits, well above the 128-bit floor. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
