/**
 * Rate limiting for the public endpoints (step 7).
 *
 * This was a seam until 2026-10-04; it is now implemented. The call sites did
 * not change, which was the point of building the seam first.
 *
 * WHERE THE DECISION IS MADE
 * --------------------------
 * In the database, by `check_rate_limit()`. An Edge Function instance is
 * ephemeral and horizontally scaled, so in-memory counting would be worthless:
 * two requests can land on two instances. The windows themselves live in the
 * `rate_limit_rules` table so they can be tuned without a deploy.
 *
 * WHAT THIS FILE DOES
 * -------------------
 * Works out WHICH client is asking — the one job that has to happen out here,
 * because it needs the request headers and the IP-hash salt.
 *
 * THE IP IS HASHED HERE, NEVER SENT RAW
 * -------------------------------------
 * An IP address is personal data. Only `sha256(salt || ip)` crosses into the
 * database, so the attempt table cannot identify anyone if it leaks, and the raw
 * address is never written to a log either. The salt lives in an Edge secret
 * (`PUBLIC_IP_HASH_SALT`) and is required: a missing salt throws rather than
 * defaulting, because a constant salt would make every hash guessable by
 * hashing the IPv4 space.
 *
 * FAILING CLOSED
 * --------------
 * If the limiter itself errors (the database is unreachable, the salt is
 * missing), the request is REFUSED, not waved through. An unthrottled public
 * write endpoint is a worse outcome than a brief outage, and a limiter that
 * fails open is one dropped connection away from being no limiter at all.
 */

import { hashWithSalt } from './crypto.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type PublicEndpoint =
  'get_slots' | 'create_booking' | 'get_booking' | 'cancel_booking' | 'reschedule_booking';

export type RateLimitResult = {
  allowed: boolean;
  /** Advisory, for a Retry-After header. */
  retryAfterSeconds?: number;
};

/**
 * The client's IP, as the platform reports it.
 *
 * WHICH HEADER WE TRUST, AND WHY
 * ------------------------------
 * Supabase Edge Functions sit behind the platform's own proxy, which appends the
 * real client address to `x-forwarded-for`. That header is a LIST:
 *
 *     x-forwarded-for: <client-supplied>, <client-supplied>, …, <real client>
 *
 * Everything before the last entry can be set by the caller. Taking `[0]` — the
 * common mistake — lets anyone spoof their own rate-limit key by sending
 * `X-Forwarded-For: 1.2.3.4` and rotating it, escaping every per-IP limit.
 *
 * So we take the **LAST** entry: the one the nearest trusted proxy appended.
 * `x-real-ip` is the fallback, as a single value set by the same proxy.
 *
 * If neither is present we return null and the per-IP rules simply do not apply
 * for that request — the per-phone and per-business caps still do. That is
 * deliberate: a missing header must not take the endpoint down, and must not be
 * a way to escape the other limits either.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    // LAST, not first. See above.
    if (parts.length > 0) return parts[parts.length - 1] ?? null;
  }
  return req.headers.get('x-real-ip');
}

/**
 * Check and record an attempt, in one database call.
 *
 * Recording and deciding together is deliberate: two calls would race, and the
 * second could be skipped by a caller that gave up — which is precisely the
 * caller an attacker controls. `check_rate_limit()` also records BLOCKED
 * attempts, so a sustained attack stays blocked instead of oscillating around
 * the limit.
 */
export async function checkRateLimit(
  req: Request,
  db: SupabaseClient,
  endpoint: PublicEndpoint,
  opts?: { phone?: string | null; businessId?: string | null },
): Promise<RateLimitResult> {
  try {
    const ip = clientIp(req);
    const ipHash = ip ? await hashWithSalt(ip) : null;

    // The phone is hashed with the same salt: the per-phone cap must work
    // without the attempt table holding a list of customers' phone numbers.
    const keyHash = opts?.phone ? await hashWithSalt(normalisePhoneForKey(opts.phone)) : null;

    const { data, error } = await db.rpc('check_rate_limit', {
      p_endpoint: endpoint,
      p_ip_hash: ipHash,
      p_key_hash: keyHash,
      p_business_id: opts?.businessId ?? null,
      p_outcome: 'allowed',
    });

    if (error) throw error;

    const result = data as { allowed?: boolean; retry_after_seconds?: number } | null;

    if (result?.allowed === true) return { allowed: true };

    return {
      allowed: false,
      retryAfterSeconds:
        typeof result?.retry_after_seconds === 'number' ? result.retry_after_seconds : 60,
    };
  } catch (err) {
    // FAIL CLOSED. Logged so the cause is visible; the caller sees a plain 429.
    // Note the `scope` the RPC returns is never forwarded to the client: telling
    // someone "you hit the per-phone cap" would confirm that we know the phone.
    console.error(
      JSON.stringify({
        at: 'checkRateLimit',
        endpoint,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { allowed: false, retryAfterSeconds: 60 };
  }
}

/**
 * Normalise a phone so the SAME person always hashes to the same key.
 *
 * This matters more than it looks. The hash is computed here, before the
 * database normalises to E.164, so if "07700 900123" and "+447700900123" hashed
 * differently the per-phone cap would be trivially defeated: send five bookings
 * in national format, five more in international, five more with "0044", and so
 * on. The cap would count four separate "people" who are one person.
 *
 * So the last 9 significant digits are used as the key. That is the part that
 * does not change between a national and an international spelling of the same
 * number ("07700900123" and "447700900123" both end "700900123"), which makes
 * the key stable without needing the branch's dialling code out here.
 *
 * Trade-off, accepted deliberately: two different numbers sharing their last 9
 * digits across countries would share a cap. With a cap of 5 bookings per day
 * that collision is harmless — and it errs towards limiting too much rather
 * than too little, which is the right direction for an abuse control.
 */
function normalisePhoneForKey(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  // Drop a trunk '0' and any international prefix by keeping the tail.
  return digits.length > 9 ? digits.slice(-9) : digits;
}
