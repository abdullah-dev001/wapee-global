/**
 * POST /functions/v1/send_outbox — the outbox WORKER.
 *
 * Called every minute by pg_cron (through pg_net) whenever a row is due; the call
 * carries `x-worker-token`, a random token generated inside the database and kept
 * in Supabase Vault. This function never sees the Vault: it asks the database
 * (`outbox_worker_authorize`) whether the token is genuine. Anything else gets 404.
 *
 * Per run: claim up to 50 rows for the channels whose provider secrets are set
 * (the database applies every guard: stale, opted-out, caps, no credits...), then
 * send them a few at a time. Each row ends as sent / retry / dead / skipped inside
 * the database; this function only reports counts.
 *
 * Needed secrets: see supabase/functions/.env.example (RESEND_*, TWILIO_*,
 * UNSUBSCRIBE_SIGNING_KEY, PUBLIC_SITE_URL). A channel whose secrets are missing is
 * simply not claimed, so its rows wait (and expire after 48 h) rather than burn attempts.
 */

import { serviceClient } from '../_shared/supabase.ts';
import { logUnexpected } from '../_shared/response.ts';
import { processJob } from '../_shared/outbox/process.ts';
import {
  emailConfigured,
  sendEmail,
  sendPush,
  sendSms,
  smsConfigured,
} from '../_shared/outbox/providers.ts';
import type { Channel, Deps, Job, Outcome, ReserveResult } from '../_shared/outbox/types.ts';

const BATCH = 50;
const CONCURRENCY = 5;
const BUDGET_MS = 50_000;

function plain(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return plain(404, 'not found');
  const db = serviceClient();

  try {
    const { data: ok, error: authErr } = await db.rpc('outbox_worker_authorize', {
      p_token: req.headers.get('x-worker-token') ?? '',
    });
    if (authErr) throw authErr;
    if (ok !== true) return plain(404, 'not found');

    const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? '').replace(/\/+$/, '');
    const signingKey = Deno.env.get('UNSUBSCRIBE_SIGNING_KEY') ?? '';
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
    if (!siteUrl || !signingKey || !supabaseUrl) {
      logUnexpected(
        'send_outbox',
        null,
        new Error('PUBLIC_SITE_URL, UNSUBSCRIBE_SIGNING_KEY or SUPABASE_URL is not set'),
      );
      return plain(503, 'not configured');
    }

    const channels: Channel[] = ['push'];
    if (emailConfigured()) channels.push('email');
    if (smsConfigured()) channels.push('sms');

    const deps: Deps = {
      db: {
        async reserveSms(id, body): Promise<ReserveResult> {
          const { data, error } = await db.rpc('outbox_reserve_sms', { p_id: id, p_body: body });
          if (error) throw error;
          const r = data as {
            ok?: boolean;
            code?: string;
            to?: string;
            segments?: number;
            encoding?: string;
            credits?: number;
          };
          if (r.ok === true && r.to) {
            return {
              ok: true,
              to: r.to,
              segments: r.segments ?? 0,
              encoding: r.encoding ?? '',
              credits: r.credits ?? 0,
            };
          }
          return { ok: false, code: r.code ?? 'error' };
        },
        async complete(id, provider, providerId, deadTokens) {
          const { error } = await db.rpc('outbox_complete', {
            p_id: id,
            p_provider: provider,
            p_provider_id: providerId,
            p_dead_tokens: deadTokens,
          });
          if (error) throw error;
        },
        async fail(id, message, retryable, definite = false) {
          const { error } = await db.rpc('outbox_fail', {
            p_id: id,
            p_error: message,
            p_retryable: retryable,
            p_definite: definite,
          });
          if (error) throw error;
        },
        async suppress(businessId, channel, hash, source) {
          const { error } = await db.rpc('suppress_recipient', {
            p_business: businessId,
            p_channel: channel,
            p_hash: hash,
            p_source: source,
          });
          if (error) throw error;
        },
        async removeDeadTokens(id, tokenIds) {
          const { error } = await db.rpc('push_remove_dead_tokens', {
            p_outbox: id,
            p_token_ids: tokenIds,
          });
          if (error) throw error;
        },
      },
      providers: { sendEmail, sendSms, sendPush },
      config: {
        publicSiteUrl: siteUrl,
        unsubscribeUrl: `${supabaseUrl}/functions/v1/unsubscribe`,
        signingKey,
        now: () => Date.now(),
      },
    };

    const started = Date.now();
    const counts: Record<Outcome, number> = { sent: 0, retry: 0, dead: 0, skipped: 0 };
    let claimed = 0;

    // Keep claiming while there is work and time (a backlog drains within one run).
    while (Date.now() - started < BUDGET_MS) {
      const { data, error } = await db.rpc('outbox_claim', {
        p_limit: BATCH,
        p_channels: channels,
      });
      if (error) throw error;
      const jobs = (data ?? []) as Job[];
      if (jobs.length === 0) break;
      claimed += jobs.length;
      for (let i = 0; i < jobs.length; i += CONCURRENCY) {
        const results = await Promise.all(
          jobs.slice(i, i + CONCURRENCY).map((j) => processJob(j, deps)),
        );
        for (const r of results) counts[r] += 1;
      }
      if (jobs.length < BATCH) break;
    }

    return new Response(JSON.stringify({ ok: true, claimed, ...counts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    logUnexpected('send_outbox', null, err);
    return plain(500, 'error');
  }
});
