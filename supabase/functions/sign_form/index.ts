/**
 * POST /functions/v1/sign_form   (PUBLIC: verify_jwt = false; the client has no account)
 *
 * The tokenised signing link of Forms & Consent. Same pattern as the review page and the manage link:
 *   - the token is 256-bit, only its sha256 is stored, it expires, it is single use, and EVERY token
 *     failure (unknown, expired, used, revoked, template deleted, add-on off, business inactive) is the
 *     same `invalid_token`;
 *   - per-IP rate limit (the counter lives in the database and fails CLOSED);
 *   - a honeypot field on submit;
 *   - the RPCs return `{ok:false,code}` and never raise, so the counter incremented here survives.
 *
 *   { action: 'get',    token }
 *   { action: 'submit', token, answers, signer_name, signature, company_website?: honeypot }
 *
 * The page payload carries the first name only and NO sensitive flags, ids, phone or email. The raw IP
 * is never stored: only sha256(salt || ip) crosses into the database (`PUBLIC_IP_HASH_SALT`).
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts';
import { hashWithSalt } from '../_shared/crypto.ts';
import { honeypotTripped } from '../_shared/startToken.ts';

const tokenSchema = z
  .string()
  .trim()
  .min(32)
  .max(200)
  .regex(/^[0-9a-f]+$/, 'invalid token');

const GetSchema = z.object({ action: z.literal('get'), token: tokenSchema }).strict();
const SubmitSchema = z
  .object({
    action: z.literal('submit'),
    token: tokenSchema,
    answers: z.record(
      z.string().max(60),
      z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]),
    ),
    signer_name: z.string().trim().max(120),
    signature: z
      .array(z.array(z.tuple([z.number(), z.number()])).max(1000))
      .max(50)
      .nullish(),
    company_website: z.string().max(200).nullish(),
  })
  .strict();
const RequestSchema = z.discriminatedUnion('action', [GetSchema, SubmitSchema]);

function mapCode(code: string | null | undefined): Parameters<typeof jsonError>[1] {
  switch (code) {
    case 'invalid_token':
      return 'invalid_token';
    case 'missing_answer':
      return 'missing_answer';
    case 'invalid_answer':
      return 'invalid_answer';
    case 'invalid_name':
      return 'invalid_name';
    case 'signature_required':
      return 'signature_required';
    case 'invalid_signature':
      return 'invalid_signature';
    default:
      // appointment_mismatch / not_found / anything unforeseen: generic, never forwarded.
      return 'invalid_token';
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  try {
    const db = serviceClient();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, 'bad_request');
    }
    const action = body && typeof body === 'object' ? (body as { action?: unknown }).action : null;
    const endpoint = action === 'submit' ? 'submit_form_request' : 'get_form_request';

    const limit = await checkRateLimit(req, db, endpoint);
    if (!limit.allowed)
      return jsonError(req, 'rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });

    if (body && typeof body === 'object' && honeypotTripped(body as Record<string, unknown>)) {
      return jsonError(req, 'bad_request'); // generic: no tuning hint
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(req, 'bad_request');

    if (parsed.data.action === 'get') {
      const { data, error } = await db.rpc('get_form_request', { p_token: parsed.data.token });
      if (error) throw error;
      const r = data as Record<string, unknown> | null;
      if (!r || r.ok !== true) return jsonError(req, 'invalid_token');
      // Mapped field by field: a column added to the RPC later cannot reach the page by accident.
      return jsonOk(req, {
        business_name: r.business_name,
        client_first_name: r.client_first_name,
        title: r.title,
        kind: r.kind,
        body: r.body,
        fields: r.fields,
        requires_signature: r.requires_signature,
        expires_at: r.expires_at,
      });
    }

    const ip = clientIp(req);
    const { data, error } = await db.rpc('submit_form_request', {
      p_token: parsed.data.token,
      p_answers: parsed.data.answers,
      p_signer_name: parsed.data.signer_name,
      p_signature: parsed.data.signature ?? null,
      p_ip_hash: ip ? await hashWithSalt(ip) : null,
    });
    if (error) throw error;
    const r = data as { ok?: boolean; code?: string; field_id?: string } | null;
    if (!r || r.ok !== true)
      return jsonError(req, mapCode(r?.code), { fieldId: r?.field_id ?? null });
    return jsonOk(req, { signed: true });
  } catch (err) {
    logUnexpected('sign_form', null, err);
    return jsonError(req, 'server_error');
  }
});
