/**
 * POST /functions/v1/message_preview   (JWT REQUIRED)
 *
 * Request   { branch_id: uuid, event: <client event>, channel: 'email' | 'sms' }
 * Response  { ok: true, data: { subject, text, encoding, units, segments,
 *             credits_per_segment, credits, rate_available, country_code } }
 *
 * The notification settings screen shows what a customer will actually receive
 * and, for SMS, what it costs in credits. The text is rendered by the SAME
 * templates the worker uses (`_shared/outbox/templates.ts`), with sample data and
 * a link of realistic length, so the preview can never drift from the real thing.
 * Segments and encoding come from the database function `sms_segments`; the rate
 * is the branch country's row in `sms_country_rates` (none = "no rate": the real
 * send would be refused too).
 *
 * Caller must hold `settings.booking` for the branch (checked through the
 * caller's own JWT, so RLS and `can()` decide, not this function).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { renderEmail, renderSms } from '../_shared/outbox/templates.ts';
import type { Job, OutboxEvent } from '../_shared/outbox/types.ts';
import { siteUrl } from '../_shared/site.ts';

const EVENTS = [
  'booking_confirmed',
  'pending_received',
  'reminder',
  'rescheduled',
  'cancelled',
  'manage_link',
  'review_request',
] as const;

const RequestSchema = z
  .object({
    branch_id: z.string().uuid(),
    event: z.enum(EVENTS),
    channel: z.enum(['email', 'sms']),
  })
  .strict();

function reply(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req.headers.get('origin')),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return reply(req, 405, { ok: false, code: 'bad_request' });

  try {
    const auth = req.headers.get('authorization') ?? '';
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!auth || !url || !anon) return reply(req, 401, { ok: false, code: 'unauthorized' });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return reply(req, 400, { ok: false, code: 'bad_request' });
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return reply(req, 400, { ok: false, code: 'bad_request' });
    const input = parsed.data;

    // As the CALLER: RLS lets a member read the branch; can() checks the permission.
    const user = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: branch } = await user
      .from('branches')
      .select('id, business_id, name, address, phone, timezone, country_code')
      .eq('id', input.branch_id)
      .maybeSingle();
    if (!branch) return reply(req, 404, { ok: false, code: 'not_found' });
    const { data: allowed } = await user.rpc('can', {
      p_business_id: branch.business_id,
      p_branch_id: branch.id,
      p_permission: 'settings.booking',
    });
    if (allowed !== true) return reply(req, 404, { ok: false, code: 'not_found' });

    const db = serviceClient();
    const { data: business } = await db
      .from('businesses')
      .select('name, language, slug')
      .eq('id', branch.business_id)
      .maybeSingle();
    if (!business) return reply(req, 404, { ok: false, code: 'not_found' });

    const site = siteUrl();
    const sampleToken = 'a'.repeat(64);
    const job: Job = {
      id: 'preview',
      channel: input.channel,
      event: input.event as OutboxEvent,
      attempt: 1,
      idempotency_key: 'preview',
      business_id: branch.business_id,
      branch_id: branch.id,
      business_name: business.name,
      language: business.language,
      slug: business.slug,
      branch_name: branch.name,
      branch_address: branch.address,
      branch_phone: branch.phone,
      timezone: branch.timezone,
      starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      appointment_status: 'confirmed',
      service_name: 'Haircut',
      staff_name: null,
      client_first_name: 'Sam',
      client_name: 'Sam Example',
      payload: {},
      token: sampleToken,
      to: null,
      recipient_hash: null,
      tokens: [],
    };
    const links = {
      manageUrl: `${site}/${business.slug}/manage#token=${sampleToken}`,
      reviewUrl: `${site}/${business.slug}/review#token=${sampleToken}`,
      unsubscribeUrl: null,
    };

    if (input.channel === 'email') {
      const mail = renderEmail(job, links);
      if (!mail) return reply(req, 400, { ok: false, code: 'bad_request' });
      return reply(req, 200, { ok: true, data: { subject: mail.subject, text: mail.text } });
    }

    const text = renderSms(job, links);
    if (!text) return reply(req, 400, { ok: false, code: 'bad_request' });
    const { data: seg } = await db.rpc('sms_segments', { p_text: text });
    const row = (Array.isArray(seg) ? seg[0] : seg) as
      { out_encoding?: string; out_units?: number; out_segments?: number } | undefined;
    const { data: rate } = await db
      .from('sms_country_rates')
      .select('credits_per_segment, country_code')
      .eq('country_code', branch.country_code)
      .maybeSingle();
    const segments = row?.out_segments ?? 0;
    return reply(req, 200, {
      ok: true,
      data: {
        subject: null,
        text,
        encoding: row?.out_encoding ?? null,
        units: row?.out_units ?? 0,
        segments,
        credits_per_segment: rate?.credits_per_segment ?? null,
        credits: rate ? segments * rate.credits_per_segment : null,
        rate_available: Boolean(rate),
        country_code: branch.country_code,
      },
    });
  } catch (err) {
    logUnexpected('message_preview', null, err);
    return reply(req, 500, { ok: false, code: 'server_error' });
  }
});
