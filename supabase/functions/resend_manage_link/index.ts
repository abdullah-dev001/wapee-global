/**
 * POST /functions/v1/resend_manage_link
 *
 * DASHBOARD endpoint, not public. A customer rings the salon saying they lost
 * the email; a receptionist reissues the link.
 *
 * THIS ONE VERIFIES THE JWT
 * -------------------------
 * Unlike every other function here, the caller IS signed in, so
 * `verify_jwt` stays ON (the default) and that is pinned in config.toml with the
 * reasoning. The function then calls the RPC **as the caller**, not as the
 * service role, so the `can(business, branch, 'appointments.edit')` check inside
 * `resend_manage_link()` sees the real user.
 *
 * That is the important difference from the public endpoints: here we must NOT
 * use the service role, because doing so would bypass the permission check and
 * let any signed-in user reissue a link for any business's appointment.
 *
 * Request   { appointment_id: uuid }
 * Response  { ok: true, data: { manage_token, expires_at, manage_url } }
 *
 * The raw token is returned ONCE. The database stores only its sha256, and the
 * previous token is revoked, so a forwarded old email stops working.
 */

import { z } from 'npm:zod@3';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { randomToken } from '../_shared/crypto.ts';
import { buildManageUrl } from '../_shared/manageUrl.ts';

const RequestSchema = z.object({ appointment_id: z.string().uuid() }).strict();

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  try {
    // The caller's own Authorization header is forwarded, so RLS and
    // `auth.uid()` behave exactly as they do for a normal app request. No
    // service-role client in this file at all — see the header.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(req, 'bad_request');

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY is not set');

    const db = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, 'bad_request');
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(req, 'bad_request');

    // Generated here, so the raw value exists in this one response and is never
    // written to the database or a log.
    const token = randomToken();

    const { data, error } = await db.rpc('resend_manage_link', {
      p_appointment_id: parsed.data.appointment_id,
      p_new_token: token,
    });

    if (error) {
      // An ANON-key caller (a valid JWT, but `role: anon`) has no EXECUTE on this
      // RPC, so Postgres refuses before the function's own not_signed_in branch
      // is reached. That refusal is correct and is the real boundary — but it
      // arrives as a privilege error, and reporting it as a 500 would tell the
      // caller "something broke here" instead of "you may not do this".
      //
      // 42501 = insufficient_privilege. PostgREST also surfaces a missing
      // function as 42883/PGRST202 when the role cannot see it at all.
      const code = (error as { code?: string }).code;
      if (code === '42501' || code === '42883' || code === 'PGRST202') {
        return jsonError(req, 'not_bookable');
      }
      throw error;
    }

    const r = data as Record<string, unknown> | null;

    if (!r || r.ok !== true) {
      const code = typeof r?.code === 'string' ? r.code : null;
      // `forbidden` and `not_found` both become not_bookable (404) so a user who
      // may not touch an appointment cannot learn whether it exists.
      if (code === 'not_signed_in') return jsonError(req, 'bad_request');
      if (code === 'not_cancellable' || code === 'too_late')
        return jsonError(req, 'not_cancellable');
      return jsonError(req, 'not_bookable');
    }

    // PHASE 6 SEAM: this is where the link would be emailed or texted to the
    // customer (Resend / Twilio, from an Edge Function, per CLAUDE.md §2).
    // Until then the token comes back to the dashboard, which shows it for the
    // receptionist to copy — the same pattern the Phase 1 invite link uses.
    const publicSite = Deno.env.get('PUBLIC_SITE_URL') ?? '';

    // The link needs the business slug. Read as the caller (RLS): they already
    // passed the appointments.edit check, so they can see this row.
    let manageUrl: string | null = null;
    if (publicSite && typeof r.manage_token === 'string') {
      const { data: row } = await db
        .from('appointments')
        .select('businesses(slug)')
        .eq('id', parsed.data.appointment_id)
        .maybeSingle();
      const slug = (row as { businesses?: { slug?: string } | null } | null)?.businesses?.slug;
      if (slug) manageUrl = buildManageUrl(publicSite, slug, r.manage_token);
    }

    return jsonOk(req, {
      manage_token: r.manage_token,
      expires_at: r.expires_at,
      // Built here so one place owns the link shape (`_shared/manageUrl.ts`).
      // null = no base URL or slug: the dashboard shows the token only.
      manage_url: manageUrl,
    });
  } catch (err) {
    logUnexpected('resend_manage_link', null, err);
    return jsonError(req, 'server_error');
  }
});
