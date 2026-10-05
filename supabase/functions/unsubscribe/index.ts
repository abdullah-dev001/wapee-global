/**
 * GET|POST /functions/v1/unsubscribe?t=<signed token>
 *
 * The one-click link in reminder and review emails (also sent as List-Unsubscribe
 * / List-Unsubscribe-Post). The token is HMAC-signed and bound to one business and
 * one recipient hash (see _shared/outbox/unsubscribe.ts).
 *
 * EVERY outcome (good link, forged, expired, malformed, unknown recipient) gets
 * the SAME 200 text, so the endpoint cannot be used to find out who is on a list.
 * Only a rate-limited caller sees a different status (429), and that depends on
 * the caller's IP, not on the link.
 *
 * Edge Functions cannot serve HTML (they are sent as text/plain), so the reply is a
 * plain sentence. A friendlier page is a later UI task.
 *
 * Secret: UNSUBSCRIBE_SIGNING_KEY. Transactional messages (confirmations, changes,
 * cancellations, the manage link) have no unsubscribe: they cannot be opted out of.
 */

import { serviceClient } from '../_shared/supabase.ts';
import { logUnexpected } from '../_shared/response.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { verifyUnsubscribe } from '../_shared/outbox/unsubscribe.ts';

const REPLY =
  'If this link was valid, you have been unsubscribed from reminders and review requests.';

function plain(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'GET' && req.method !== 'POST') return plain(405, 'method not allowed');

  try {
    const db = serviceClient();
    const limit = await checkRateLimit(req, db, 'unsubscribe');
    if (!limit.allowed) {
      return new Response('too many requests', {
        status: 429,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Retry-After': String(limit.retryAfterSeconds ?? 60),
        },
      });
    }

    const token = new URL(req.url).searchParams.get('t');
    const payload = await verifyUnsubscribe(
      Deno.env.get('UNSUBSCRIBE_SIGNING_KEY') ?? '',
      token,
      Date.now(),
    );
    if (payload) {
      const { error } = await db.rpc('suppress_recipient', {
        p_business: payload.b,
        p_channel: payload.c,
        p_hash: payload.h,
        p_source: 'unsubscribe_link',
      });
      if (error) throw error;
    }
    return plain(200, REPLY);
  } catch (err) {
    logUnexpected('unsubscribe', null, err);
    return plain(500, 'error');
  }
});
