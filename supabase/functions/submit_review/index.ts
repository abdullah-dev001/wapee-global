/**
 * POST /functions/v1/submit_review
 *
 * Request   { token, rating: 1..5, comment?: string (<=2000), company_website?: honeypot }
 * Response  { ok: true, data: { google_review_url: string | null } }
 *           { ok: false, code: 'invalid_token' | 'bad_request' | 'rate_limited' | 'server_error' }
 *
 * COMPLIANCE (doc §6.4): `google_review_url` is the branch's single link,
 * returned for EVERY rating — this file never looks at `rating` after
 * validating it, and there is no code path that withholds the link by stars.
 * It is never returned on a failure (invalid/expired/used token).
 *
 * The RPC returns {ok:false,code} and never raises, so the rate-limit counter
 * incremented above it survives (the accept_invite trap).
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { honeypotTripped } from '../_shared/startToken.ts';

const RequestSchema = z
  .object({
    token: z.string().min(32).max(256),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).nullish(),
    company_website: z.string().max(200).nullish(),
  })
  .strict();

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  try {
    const db = serviceClient();

    const limit = await checkRateLimit(req, db, 'submit_review');
    if (!limit.allowed) {
      return jsonError(req, 'rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, 'bad_request');
    }
    if (body && typeof body === 'object' && honeypotTripped(body as Record<string, unknown>)) {
      return jsonError(req, 'bad_request'); // generic: no tuning hint
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(req, 'bad_request');

    const { data, error } = await db.rpc('submit_review', {
      p_token: parsed.data.token,
      p_rating: parsed.data.rating,
      p_comment: parsed.data.comment ?? null,
    });
    if (error) throw error;

    const r = data as { ok?: boolean; code?: string; google_review_url?: string | null } | null;
    if (!r || r.ok !== true) {
      if (r?.code === 'invalid_rating' || r?.code === 'invalid_comment') {
        return jsonError(req, 'bad_request');
      }
      return jsonError(req, 'invalid_token');
    }

    return jsonOk(req, { google_review_url: r.google_review_url ?? null });
  } catch (err) {
    logUnexpected('submit_review', null, err);
    return jsonError(req, 'server_error');
  }
});
