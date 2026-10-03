/**
 * The booking-form START TOKEN: server-side proof of how long the form was open.
 *
 * THE PROBLEM
 * -----------
 * "Reject anything submitted in under 3 seconds" needs a trustworthy start time.
 * A client-reported `opened_at` is worthless — a bot sends whatever it likes. A
 * server-side session would work, but these endpoints are deliberately
 * stateless and the customer has no account.
 *
 * THE ANSWER
 * ----------
 * When the page loads, `get_slots` returns a start token:
 *
 *     <issued_at_ms>.<slug>.<nonce>.<hmac>
 *
 * The HMAC is over the first three parts with a secret only the server has
 * (`PUBLIC_FORM_HMAC_KEY`). So the issue time is **signed by us**: a bot can
 * replay a token but cannot backdate one, and cannot mint one at all.
 *
 * WHAT IT PROVES, AND WHAT IT DOES NOT
 * ------------------------------------
 * It proves: this token was issued by us, for THIS slug, at THIS time, and has
 * not been tampered with. Enough to enforce "the form was open for at least N
 * seconds" and "it was not opened an hour ago".
 *
 * It does NOT prove a human was present. A determined bot can call `get_slots`,
 * wait three seconds, and then book — which is exactly why this sits alongside
 * the per-IP, per-phone and per-business caps rather than replacing them. It
 * raises the cost of naive abuse to near-zero effort on our side and real effort
 * on theirs.
 *
 * WHY IT IS BOUND TO THE SLUG
 * ---------------------------
 * Without the binding, a token harvested from one business's page would work
 * against every other business, so one `get_slots` call would buy an attacker
 * unlimited booking attempts across the whole platform.
 *
 * A NONCE IS INCLUDED but deliberately NOT tracked server-side. Tracking it
 * would make the token single-use, which breaks a legitimate customer who
 * submits twice after a validation error. It is there so two tokens issued in
 * the same millisecond differ, and so a token is not guessable from its parts.
 */

import { BOT_PROTECTION } from './config.ts';
import { hmacHex, randomToken, timingSafeEqual } from './crypto.ts';

export type StartTokenCheck =
  | { ok: true }
  // The token is missing, malformed, for another slug, expired, or forged.
  // One code, because none of those distinctions help an honest caller and all
  // of them help an attacker.
  | { ok: false; reason: 'invalid' }
  // It was issued, and genuinely too recently.
  | { ok: false; reason: 'too_fast' };

/** Issue a token for this slug. Called by get_slots. */
export async function issueStartToken(slug: string): Promise<string> {
  const issuedAt = Date.now();
  const nonce = randomToken().slice(0, 16);
  const payload = `${issuedAt}.${slug}.${nonce}`;
  const signature = await hmacHex(payload);
  return `${payload}.${signature}`;
}

/** Verify a token against the slug it must have been issued for. */
export async function verifyStartToken(
  token: string | null | undefined,
  slug: string,
): Promise<StartTokenCheck> {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid' };

  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'invalid' };

  const [issuedAtRaw, tokenSlug, nonce, signature] = parts as [string, string, string, string];

  // The signature is checked BEFORE anything is believed, so a forged token
  // never reaches the timing logic.
  const expected = await hmacHex(`${issuedAtRaw}.${tokenSlug}.${nonce}`);
  if (!timingSafeEqual(signature, expected)) return { ok: false, reason: 'invalid' };

  // Bound to the slug it was issued for.
  if (tokenSlug !== slug) return { ok: false, reason: 'invalid' };

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: 'invalid' };

  const ageMs = Date.now() - issuedAt;

  // A token from the future means a tampered timestamp (the signature covers it,
  // so this is belt and braces) or badly skewed clocks. Either way, not usable.
  // A small negative allowance absorbs ordinary clock jitter between instances.
  if (ageMs < -5_000) return { ok: false, reason: 'invalid' };

  if (ageMs > BOT_PROTECTION.startTokenTtlSeconds * 1000) {
    // Expired. Reported as `invalid` rather than "expired" so the page's retry
    // path is the same one it uses for a tampered token: fetch the form again.
    return { ok: false, reason: 'invalid' };
  }

  if (ageMs < BOT_PROTECTION.minFormSeconds * 1000) {
    return { ok: false, reason: 'too_fast' };
  }

  return { ok: true };
}

/**
 * The honeypot.
 *
 * `BOT_PROTECTION.honeypotField` is rendered hidden with CSS and left empty by
 * any human. Any value means a bot filled it in.
 *
 * It must be hidden with CSS (`position:absolute;left:-9999px`) and NOT with
 * `type="hidden"` or `display:none`, because better bots skip both. It also
 * needs `autocomplete="off"` and `tabindex="-1"` so a browser's autofill or a
 * keyboard user never touches it. Noted here because the field name is defined
 * here and the UI must match.
 */
export function honeypotTripped(body: Record<string, unknown>): boolean {
  const value = body[BOT_PROTECTION.honeypotField];
  return typeof value === 'string' && value.trim().length > 0;
}
