/**
 * POST /functions/v1/unsubscribe  (token in `?t=` or a JSON body `{ t }`)
 * GET  /functions/v1/unsubscribe  -> changes NOTHING
 *
 * The confirm PAGE is the app route `/unsubscribe#t=<token>` (Edge Functions are
 * served as text/plain and cannot show a button). The page's button POSTs here.
 * The `List-Unsubscribe-Post` one-click header of reminder / review emails also
 * POSTs here. A GET (a link scanner, a curious click) only returns a fixed hint,
 * so a bot opening the link cannot unsubscribe anyone.
 *
 * The token is HMAC-signed and bound to one business and one recipient hash (see
 * _shared/outbox/unsubscribe.ts). EVERY POST (good, forged, expired, malformed,
 * unknown recipient) returns the SAME 200 text, so the endpoint cannot be used to
 * learn who is on a list. Only a rate-limited caller sees 429 (depends on the IP,
 * not on the token) and a database failure 500.
 *
 * Secret: UNSUBSCRIBE_SIGNING_KEY. Transactional messages have no unsubscribe.
 */

import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { verifyUnsubscribe } from '../_shared/outbox/unsubscribe.ts';

const REPLY =
  'If this link was valid, you have been unsubscribed from reminders and review requests.';
const GET_HINT = 'Open the unsubscribe page from your email and press the confirm button.';

function plain(
  req: Request,
  status: number,
  body: string,
  extra: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(req.headers.get('origin')),
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

async function tokenFrom(req: Request): Promise<string | null> {
  const q = new URL(req.url).searchParams.get('t');
  if (q) return q;
  try {
    const type = req.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
      const body = (await req.json()) as { t?: unknown };
      return typeof body.t === 'string' ? body.t : null;
    }
  } catch {
    return null;
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method === 'GET') return plain(req, 200, GET_HINT);
  if (req.method !== 'POST') return plain(req, 405, 'method not allowed');

  try {
    const db = serviceClient();
    const limit = await checkRateLimit(req, db, 'unsubscribe');
    if (!limit.allowed) {
      return plain(req, 429, 'too many requests', {
        'Retry-After': String(limit.retryAfterSeconds ?? 60),
      });
    }

    const payload = await verifyUnsubscribe(
      Deno.env.get('UNSUBSCRIBE_SIGNING_KEY') ?? '',
      await tokenFrom(req),
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
    return plain(req, 200, REPLY);
  } catch (err) {
    logUnexpected('unsubscribe', null, err);
    return plain(req, 500, 'error');
  }
});
