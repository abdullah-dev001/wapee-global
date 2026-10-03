/**
 * THE one place the public-endpoint protection constants live.
 *
 * The rate-limit WINDOWS live in the database (`rate_limit_rules`), so they can
 * be tuned without a deploy. What lives here is everything the Edge Function
 * itself needs to decide: the bot-protection timings, the start-token lifetime,
 * and the secret names.
 */

/** Edge secret names. Set with `supabase secrets set NAME=value`. */
export const SECRET_NAMES = {
  /** Salt for hashing client IPs. The IP is never stored raw. */
  ipHashSalt: 'PUBLIC_IP_HASH_SALT',
  /** HMAC key for signing the booking-form start token. */
  formHmacKey: 'PUBLIC_FORM_HMAC_KEY',
} as const;

export const BOT_PROTECTION = {
  /**
   * How long a start token stays valid. A real customer picks a service, a day
   * and a slot, then fills a short form; 30 minutes is generous for that and
   * still bounds how long a harvested token is worth anything.
   */
  startTokenTtlSeconds: 30 * 60,

  /**
   * The minimum time between the form being issued and the booking arriving.
   *
   * A human cannot read a form, type a name, a phone and any custom answers in
   * under three seconds. A script can. This is the cheapest bot filter there is,
   * and unlike a CAPTCHA it costs a real customer nothing.
   *
   * Deliberately low: the cost of a false positive (a fast, returning customer
   * with autofill being told to try again) is much worse than letting a slow bot
   * through, and the per-IP and per-phone caps catch the slow bot anyway.
   */
  minFormSeconds: 3,

  /**
   * The honeypot field name. It must look plausible enough that a naive bot
   * fills it, and never be shown to a human (hidden via CSS, not `type=hidden`,
   * which some bots skip).
   *
   * Any value at all in this field means "not a human".
   */
  honeypotField: 'company_website',
} as const;

/**
 * Turnstile seam — NOT wired up, and deliberately no dependency.
 *
 * If the measures above ever prove insufficient, Cloudflare Turnstile slots in
 * here: the page would send a `turnstile_token`, and `verifyBotSignals()` would
 * additionally POST it to Cloudflare's siteverify endpoint. That is one `fetch`
 * and one secret (`TURNSTILE_SECRET_KEY`), with no library.
 *
 * It is left off because a CAPTCHA is a real cost to every honest customer, and
 * the honeypot + timing + per-IP/phone/business caps should handle ordinary
 * abuse. Revisit if the attempt table shows sustained pressure.
 */
export const TURNSTILE_ENABLED = false;
