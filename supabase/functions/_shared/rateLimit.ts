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
  | 'get_booking_page'
  | 'get_slots'
  | 'create_booking'
  | 'get_booking'
  | 'cancel_booking'
  | 'reschedule_booking'
  | 'get_website'
  | 'get_review_request'
  | 'submit_review'
  | 'validate_widget'
  | 'unsubscribe'
  | 'get_form_request'
  | 'submit_form_request'
  | 'portal_info'
  | 'portal_request_login'
  | 'portal_exchange'
  | 'portal_read'
  | 'portal_write'
  | 'portal_data_request';

export type RateLimitResult = {
  allowed: boolean;
  /** Advisory, for a Retry-After header. */
  retryAfterSeconds?: number;
};

/**
 * The client's IP.
 *
 * WHICH HEADER WE TRUST, AND WHY — MEASURED, NOT ASSUMED
 * -----------------------------------------------------
 * **`cf-connecting-ip`.** Supabase Edge Functions sit behind Cloudflare, which
 * sets this header to the real client address and does not let a caller forge it.
 *
 * This was verified against the DEPLOYED function on 2026-10-04 (real client
 * address `154.208.43.55`):
 *
 *   x-forwarded-for  = 154.208.43.55,154.208.43.55, 13.248.117.77
 *   cf-connecting-ip = 154.208.43.55
 *
 * Three things that measurement settled:
 *
 * 1. **The LAST entry of `x-forwarded-for` is a PROXY, not the client.** Across
 *    five consecutive calls it was 13.248.117.77, 13.248.117.73, 99.82.173.50 …
 *    — rotating AWS edge addresses — while `cf-connecting-ip` was stable. An
 *    earlier version of this file keyed on that last entry, which would have put
 *    every caller on the planet into a handful of shared buckets: one busy
 *    business would have rate-limited everybody. That was a real bug, caught only
 *    by checking against the deployed function.
 *
 * 2. **A client-supplied `X-Forwarded-For` never arrives.** Sending
 *    `X-Forwarded-For: 1.2.3.4` and `1.2.3.4, 5.6.7.8` changed nothing: the
 *    platform replaces the header. So the usual "leading entries are
 *    attacker-controlled" worry does not apply here — but we do not rely on that,
 *    because it is a platform behaviour that could change.
 *
 * 3. **`cf-connecting-ip` cannot be spoofed at all.** A request carrying it is
 *    rejected by Cloudflare with `403 error code: 1000` before it reaches us.
 *    That is a stronger guarantee than "we parse it carefully".
 *
 * `x-real-ip` and then the FIRST `x-forwarded-for` entry are fallbacks, in case
 * the platform's edge changes. The first entry is the right fallback precisely
 * because the measurement above shows the real client leads the list here.
 *
 * If nothing is present we return null and the per-IP rules do not apply for that
 * request — the per-phone and per-business caps still do. A missing header must
 * not take the endpoint down, and must not be a way to escape the other limits.
 *
 * **If this is ever ported off Supabase/Cloudflare, re-measure before trusting
 * any of it.** The correct header is a property of the deployment, not of HTTP.
 */
export function clientIp(req: Request): string | null {
  // Set by Cloudflare, unforgeable (a request that sends it is rejected at the
  // edge with 403/1000). This is the one to use here.
  const cf = req.headers.get('cf-connecting-ip');
  if (cf && cf.trim()) return cf.trim();

  // Fallbacks, for a future edge that does not set the above.
  const real = req.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    // FIRST, because on this platform the real client leads the list and the
    // trailing entries are rotating proxies (measured; see above).
    if (parts.length > 0) return parts[0] ?? null;
  }

  return null;
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
  opts?: {
    phone?: string | null;
    key?: string | null;
    businessId?: string | null;
    /**
     * Leave the IP out of this call. For a SECOND call in the same request
     * (create_booking's business caps): the IP was already counted by the
     * first call, and counting it again made one booking cost several IP
     * attempts (QA F5).
     */
    skipIp?: boolean;
  },
): Promise<RateLimitResult> {
  try {
    const ip = opts?.skipIp ? null : clientIp(req);
    const ipHash = ip ? await hashWithSalt(ip) : null;

    // The phone is hashed with the same salt: the per-phone cap must work
    // without the attempt table holding a list of customers' phone numbers.
    // `key` is any other identity worth capping (the portal uses the EMAIL), hashed the same way.
    const keyHash = opts?.key
      ? await hashWithSalt('k:' + opts.key.trim().toLowerCase())
      : opts?.phone
        ? await hashWithSalt(normalisePhoneForKey(opts.phone))
        : null;

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
