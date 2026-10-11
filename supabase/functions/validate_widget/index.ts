/**
 * POST /functions/v1/validate_widget
 *
 * The embed widget's server side. Three actions, one endpoint (shared rate
 * limit and the same generic failure):
 *
 *   validate      { action:'validate', key }
 *     Called by widget.js ON THE CUSTOMER'S SITE. The origin is read from the
 *     browser-set `Origin` header (never from the body). If the key is active
 *     and that origin is on its allow-list: { slug, embed_token, expires_in }.
 *     The token is bound to slug + origin and expires after 1 hour.
 *
 *   verify        { action:'verify', token, slug, origin }
 *     Called by the booking page INSIDE the iframe with the embedding origin it
 *     observed. True only if the token is genuine, unexpired, for this slug and
 *     this origin, AND the origin is still on the allow-list.
 *
 *   frame_policy  { action:'frame_policy', slug }
 *     The CSP `frame-ancestors` sources for the slug's booking page. For the
 *     host layer that serves the page (the REAL enforcement, a launch blocker:
 *     see context/website-reviews-widget.md).
 *
 * Every refusal is the same `not_found`. CORS: `validate` must work from any
 * customer site, so it echoes the caller's origin; that is safe because a caller
 * whose origin is not allowed learns nothing.
 */

import { z } from 'npm:zod@3';
import { openCorsHeaders } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { EMBED_TOKEN } from '../_shared/config.ts';
import { issueEmbedToken, normaliseOrigin, verifyEmbedToken } from '../_shared/embedToken.ts';

const Slug = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('validate'), key: z.string().regex(/^wk_[0-9a-f]{32}$/) }).strict(),
  z
    .object({
      action: z.literal('verify'),
      token: z.string().min(1).max(600),
      slug: Slug,
      origin: z.string().min(1).max(300),
    })
    .strict(),
  z.object({ action: z.literal('frame_policy'), slug: Slug }).strict(),
]);

/** Re-wrap a response with the open CORS headers (validate only). */
function withOpenCors(res: Response, origin: string | null): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(openCorsHeaders(origin))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/** Is `origin` covered by a list of CSP frame-ancestors sources? Port-insensitive. */
function coveredBy(ancestors: string[], origin: string): boolean {
  const norm = normaliseOrigin(origin);
  if (!norm) return false;
  const u = new URL(norm);
  const bare = `${u.protocol}//${u.hostname}`;
  return ancestors.some((a) => a === bare || (a.endsWith(':*') && a.slice(0, -2) === bare));
}

Deno.serve(async (req: Request): Promise<Response> => {
  const requestOrigin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: openCorsHeaders(requestOrigin) });
  }
  const done = (res: Response) => withOpenCors(res, requestOrigin);

  if (req.method !== 'POST') return done(jsonError(req, 'bad_request'));

  try {
    const db = serviceClient();

    const limit = await checkRateLimit(req, db, 'validate_widget');
    if (!limit.allowed) {
      return done(jsonError(req, 'rate_limited', { retryAfterSeconds: limit.retryAfterSeconds }));
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return done(jsonError(req, 'bad_request'));
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return done(jsonError(req, 'bad_request'));
    const input = parsed.data;

    if (input.action === 'validate') {
      // The browser-set Origin header, never a body field a script could forge.
      const origin = requestOrigin ? normaliseOrigin(requestOrigin) : null;
      if (!origin) return done(jsonError(req, 'not_found'));

      const { data, error } = await db.rpc('validate_widget_origin', {
        p_public_key: input.key,
        p_origin: origin,
      });
      if (error) throw error;
      const r = data as { ok?: boolean; slug?: string } | null;
      if (!r || r.ok !== true || !r.slug) return done(jsonError(req, 'not_found'));

      return done(
        jsonOk(req, {
          slug: r.slug,
          embed_token: await issueEmbedToken(r.slug, origin),
          expires_in: EMBED_TOKEN.ttlSeconds,
        }),
      );
    }

    if (input.action === 'verify') {
      const tokenOrigin = await verifyEmbedToken(input.token, input.slug);
      const claimed = normaliseOrigin(input.origin);
      if (!tokenOrigin || !claimed || normaliseOrigin(tokenOrigin) !== claimed) {
        return done(jsonError(req, 'not_found'));
      }
      // Still allowed NOW (the owner may have removed the domain since).
      const { data, error } = await db.rpc('get_widget_frame_ancestors', { p_slug: input.slug });
      if (error) throw error;
      if (!coveredBy((data as string[] | null) ?? [], claimed)) {
        return done(jsonError(req, 'not_found'));
      }
      return done(jsonOk(req, { valid: true }));
    }

    // frame_policy
    const { data, error } = await db.rpc('get_widget_frame_ancestors', { p_slug: input.slug });
    if (error) throw error;
    return done(jsonOk(req, { frame_ancestors: (data as string[] | null) ?? [] }));
  } catch (err) {
    logUnexpected('validate_widget', null, err);
    return done(jsonError(req, 'server_error'));
  }
});
