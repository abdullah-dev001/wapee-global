/**
 * THE RATE-LIMIT SEAM. Step 7 fills this in; it does nothing yet.
 *
 * This file exists now, and is already called by both public endpoints, so that
 * step 7 is a change to ONE function body rather than a change to every
 * endpoint. The call sites, the ordering and the failure shape are settled here;
 * only the counting is missing.
 *
 * WHAT STEP 7 WILL ADD (agreed plan)
 * ----------------------------------
 * * A `public_request_attempts` table keyed by **hashed IP** (HMAC with a secret
 *   salt from Edge secrets, never the raw IP — an IP is personal data and a
 *   plaintext log of visitor IPs is a liability) plus the endpoint name.
 * * Per-phone and per-business daily caps, so one number cannot spam one
 *   business and one business cannot be used to spam many numbers.
 * * A honeypot field and a minimum time-on-form, both verified SERVER-side
 *   against an **HMAC-signed start token** issued when the form is opened.
 *   Client-reported timings are not trusted.
 * * Retention cleanup for old rows.
 * * A seam for Cloudflare Turnstile later, without a dependency now.
 *
 * WHY THE COUNTER MUST LIVE IN THE DATABASE, INSIDE THE RPC
 * --------------------------------------------------------
 * An Edge Function instance is ephemeral and horizontally scaled, so in-memory
 * counting is worthless. The counter therefore belongs in Postgres — and once it
 * does, **a RAISE inside the booking RPC would roll the increment back**, which
 * is exactly the bug `accept_invite` had (context/_handoff.md). That is why
 * `create_booking` returns `{ok:false,code}` instead of raising, and why it must
 * keep doing so.
 */

/** What a check returns. `retryAfterSeconds` is advisory, for a Retry-After header. */
export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

const ALLOWED: RateLimitResult = { allowed: true };

/**
 * The client's IP, as the platform reports it.
 *
 * Exported because step 7 needs it, and because getting it right is easy to get
 * wrong: `x-forwarded-for` is a LIST and the client-controlled entries come
 * first, so the **last** entry is the one the nearest trusted proxy appended.
 * Taking `[0]` would let a caller spoof their own key and dodge every limit.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1] ?? null;
  }
  return req.headers.get('x-real-ip');
}

/**
 * Check (and, from step 7, record) an attempt.
 *
 * Returns `allowed: true` today. It is already awaited at the top of both
 * endpoints, before any database work, so turning it on changes no call site.
 */
export function checkRateLimit(
  _req: Request,
  _endpoint: 'get_slots' | 'create_booking',
  _opts?: { slug?: string | null; phone?: string | null },
): Promise<RateLimitResult> {
  // STEP 7: hash the IP with the secret salt, upsert the attempt row, compare
  // against the window, and return allowed:false with a retry hint.
  return Promise.resolve(ALLOWED);
}
