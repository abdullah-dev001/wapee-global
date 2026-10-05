/**
 * Process ONE claimed outbox job. All I/O is injected (`Deps`), so this runs
 * unchanged against stubs in tests and against Resend / Twilio / Expo in the
 * worker. Never throws: a provider that blows up becomes a retryable failure
 * (which refunds an SMS debit, in the database).
 *
 * Rules enforced here:
 *   - the raw token is used ONLY to build the link in the message; it is never
 *     logged, never stored, never put in an error string
 *   - SMS: the credit debit happens (in the DB, atomically with the send
 *     decision) BEFORE the provider is called, and is refunded by `fail`
 *   - a Twilio "recipient replied STOP" (21610) suppresses the number and is not retried
 */

import { renderEmail, renderPush, renderSms, type Links } from './templates.ts';
import { signUnsubscribe } from './unsubscribe.ts';
import type { Deps, Job, Outcome } from './types.ts';

const MANAGE_EVENTS = new Set([
  'booking_confirmed',
  'pending_received',
  'rescheduled',
  'manage_link',
]);
const OPTIONAL_EVENTS = new Set(['reminder', 'review_request']);
const UNSUBSCRIBE_DAYS = 60;
const TWILIO_STOP = '21610';

async function buildLinks(job: Job, deps: Deps): Promise<Links> {
  const base = deps.config.publicSiteUrl;
  const slug = encodeURIComponent(job.slug);
  const token = job.token ? encodeURIComponent(job.token) : null;
  let unsubscribeUrl: string | null = null;
  let oneClickUrl: string | null = null;

  if (job.channel === 'email' && OPTIONAL_EVENTS.has(job.event) && job.recipient_hash) {
    const t = await signUnsubscribe(deps.config.signingKey, {
      b: job.business_id,
      c: 'email',
      h: job.recipient_hash,
      e: deps.config.now() + UNSUBSCRIBE_DAYS * 86_400_000,
    });
    // The email shows the confirm PAGE; the one-click header POSTs to the function.
    unsubscribeUrl = `${base}/unsubscribe#token=${encodeURIComponent(t)}`;
    oneClickUrl = `${deps.config.unsubscribeUrl}?t=${encodeURIComponent(t)}`;
  }

  return {
    manageUrl:
      token && MANAGE_EVENTS.has(job.event) ? `${base}/${slug}/manage#token=${token}` : null,
    reviewUrl:
      token && job.event === 'review_request' ? `${base}/${slug}/review#token=${token}` : null,
    unsubscribeUrl,
    oneClickUrl,
  };
}

async function failJob(
  deps: Deps,
  job: Job,
  message: string,
  retryable: boolean,
  definite = false,
): Promise<Outcome> {
  await deps.db.fail(job.id, message, retryable, definite);
  return retryable && job.attempt < 5 ? 'retry' : 'dead';
}

export async function processJob(job: Job, deps: Deps): Promise<Outcome> {
  try {
    // A link event without its token cannot be sent: fail it, never send a dead end.
    if ((job.event === 'manage_link' || job.event === 'review_request') && !job.token) {
      return await failJob(deps, job, 'missing_token', false);
    }
    const links = await buildLinks(job, deps);

    if (job.channel === 'email') {
      const mail = renderEmail(job, links);
      if (!mail || !job.to) return await failJob(deps, job, 'bad_event_or_recipient', false);
      const r = await deps.providers.sendEmail({
        to: job.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        idempotencyKey: job.idempotency_key,
        unsubscribeUrl: links.unsubscribeUrl,
        oneClickUrl: links.oneClickUrl ?? null,
      });
      if (r.ok) {
        await deps.db.complete(job.id, 'resend', r.id, []);
        return 'sent';
      }
      return await failJob(
        deps,
        job,
        `${r.code ?? 'email'}: ${r.message}`,
        r.retryable,
        r.definite === true,
      );
    }

    if (job.channel === 'sms') {
      const body = renderSms(job, links);
      if (!body) return await failJob(deps, job, 'bad_event', false);
      const reserved = await deps.db.reserveSms(job.id, body);
      if (!reserved.ok) return reserved.code === 'bad_body' ? 'dead' : 'skipped';
      const r = await deps.providers.sendSms({ to: reserved.to, body });
      if (r.ok) {
        await deps.db.complete(job.id, 'twilio', r.id, []);
        return 'sent';
      }
      if (r.code === TWILIO_STOP && job.recipient_hash) {
        await deps.db.suppress(job.business_id, 'sms', job.recipient_hash, 'provider_stop');
        return await failJob(deps, job, 'recipient_opted_out', false);
      }
      return await failJob(deps, job, `${r.code ?? 'sms'}: ${r.message}`, r.retryable);
    }

    // push
    const msg = renderPush(job);
    if (!msg) return await failJob(deps, job, 'bad_event', false);
    const out = await deps.providers.sendPush(
      job.tokens.map((t) => ({ id: t.id, token: t.token, title: msg.title, body: msg.body })),
    );
    // Dead tokens are forgotten whether or not another device got the message.
    const dead = out.deadTokenIds;
    if (out.delivered) {
      await deps.db.complete(job.id, 'expo', null, dead);
      return 'sent';
    }
    if (dead.length > 0) await deps.db.removeDeadTokens(job.id, dead);
    return await failJob(
      deps,
      job,
      out.message || 'push_failed',
      out.retryable && dead.length < job.tokens.length,
    );
  } catch (err) {
    // Provider or network blew up. Message only; no stack, no payload.
    const message = err instanceof Error ? err.name : 'error';
    try {
      return await failJob(deps, job, `exception: ${message}`, true);
    } catch {
      return 'retry';
    }
  }
}
