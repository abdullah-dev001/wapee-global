/**
 * POST /functions/v1/get_review_request
 *
 * The review page's bootstrap: what to show a customer who opens their review
 * link. Takes the raw TOKEN (never an id). An invalid, expired, used or
 * no-longer-completed token ALL return the identical `invalid_token`.
 *
 * Request   { token: string }
 * Response  { ok: true, data: { business_name, branch_name, service_name, visit_date } }
 *           { ok: false, code: 'invalid_token' | 'rate_limited' | 'bad_request' | 'server_error' }
 *
 * Deliberately NO staff name (doc §6.4: never ask customers to name staff).
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const RequestSchema = z.object({ token: z.string().min(32).max(256) }).strict();

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  try {
    const db = serviceClient();

    const limit = await checkRateLimit(req, db, 'get_review_request');
    if (!limit.allowed) {
      return jsonError(req, 'rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, 'bad_request');
    }
    const parsed = RequestSchema.safeParse(body);
    // A too-short token is the same generic failure as a wrong one.
    if (!parsed.success) return jsonError(req, 'invalid_token');

    const { data, error } = await db.rpc('get_review_request', { p_token: parsed.data.token });
    if (error) throw error;

    const r = data as {
      ok?: boolean;
      business_name?: string;
      branch_name?: string;
      service_name?: string;
      visit_date?: string;
    } | null;
    if (!r || r.ok !== true) return jsonError(req, 'invalid_token');

    return jsonOk(req, {
      business_name: r.business_name ?? null,
      branch_name: r.branch_name ?? null,
      service_name: r.service_name ?? null,
      visit_date: r.visit_date ?? null,
    });
  } catch (err) {
    logUnexpected('get_review_request', null, err);
    return jsonError(req, 'server_error');
  }
});
