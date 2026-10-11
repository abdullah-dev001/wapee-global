/**
 * Reads the signed-in user's display name from the Supabase session stored in the
 * browser, for the landing page header. NO imports and no network: the build script
 * strips the types and inlines this file into the page <head>, so it runs before first
 * paint; vitest imports it directly.
 *
 * Storage: supabase-js v2 on web keeps the session as JSON in localStorage under
 * `sb-<project ref>-auth-token` (src/lib/supabase/client.ts uses the default key).
 * Also tolerated, in case the storage ever changes: chunks `<key>.0`, `<key>.1`, ... and
 * a `base64-` prefix (the @supabase/ssr formats), and a `{ currentSession }` wrapper.
 *
 * Signed in = an access token that is NOT expired. An expired session counts as signed
 * out here even with a refresh token (the app refreshes it after the visitor opens /today).
 */

/** Longest display name shown before an ellipsis. */
export const MAX_NAME_LENGTH = 18;

type StorageLike = { getItem: (key: string) => string | null };

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Decodes a `base64-...` value (UTF-8). Null when it cannot be decoded. */
function fromBase64(value: string): string | null {
  try {
    const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** The raw stored value: the key itself, else its chunks `<key>.0`, `<key>.1`, ... joined. */
export function readStoredSession(storage: StorageLike, key: string): string | null {
  try {
    const whole = storage.getItem(key);
    if (whole) return whole;
    let joined = '';
    for (let i = 0; i < 20; i++) {
      const part = storage.getItem(`${key}.${i}`);
      if (part === null) break;
      joined += part;
    }
    return joined || null;
  } catch {
    return null;
  }
}

/** "Ada Lovelace-Byron the Third" -> "Ada Lovelace-Byron…" */
export function truncateName(name: string, max: number = MAX_NAME_LENGTH): string {
  const chars = Array.from(name.trim());
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : chars.join('');
}

/** A signed-in visitor; `name` is null when the session has no name and no email. */
export type SignedIn = { name: string | null };

/**
 * The signed-in user of a valid, non-expired stored session, or null (signed out,
 * expired, malformed). Name: user_metadata.full_name, then .name, then the email
 * before "@", truncated.
 */
export function readSignedIn(raw: string | null, nowMs: number): SignedIn | null {
  if (!raw) return null;
  try {
    const text = raw.startsWith('base64-') ? fromBase64(raw.slice('base64-'.length)) : raw;
    if (!text) return null;
    const parsed = obj(JSON.parse(text));
    const session = obj(parsed?.currentSession) ?? parsed;
    if (!session || !str(session.access_token)) return null;
    const expiresAt = typeof session.expires_at === 'number' ? session.expires_at : null;
    if (expiresAt === null || expiresAt * 1000 <= nowMs) return null;
    const user = obj(session.user);
    const meta = obj(user?.user_metadata);
    const email = str(user?.email);
    const name =
      str(meta?.full_name) ?? str(meta?.name) ?? (email ? str(email.split('@')[0]) : null);
    return { name: name ? truncateName(name) : null };
  } catch {
    return null;
  }
}
