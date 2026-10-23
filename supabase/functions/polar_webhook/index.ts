/**
 * POST /functions/v1/polar_webhook — Polar's webhook endpoint (verify_jwt = false: the Standard
 * Webhooks signature IS the authentication).
 *
 *   1. verify the signature over the RAW body (POLAR_WEBHOOK_SECRET, 5-minute window) -> else 401
 *   2. which subscription is it about (subscription.*, order.paid / order.refunded,
 *      refund.created) -> anything else: 202 and nothing
 *   3. dedupe by webhook-id (billing_begin_event): an already processed delivery -> 202
 *   4. RE-READ the subscription from Polar's API (the payload is never trusted as state) and
 *      apply it (billing_apply_subscription refuses stale / out-of-order snapshots)
 *   5. refund.created: an audit row with the amount
 *   6. follow-ups (add-ons follow the plan, duplicates refunded + revoked)
 *   7. billing_finish_event. Any failure in 4-6 -> 500, the delivery stays open and Polar's retry
 *      processes it again; a refusal from the database (e.g. unknown_product) is recorded and
 *      answered 202, since retrying would not change it.
 */

import { logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { applySnapshot, followupDeps, polarFromEnv } from '../_shared/billing/env.ts';
import { runFollowups } from '../_shared/billing/followups.ts';
import { subscriptionIdForEvent, toSnapshot } from '../_shared/billing/snapshot.ts';
import { verifyWebhook } from '../_shared/billing/webhookSignature.ts';

function plain(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return plain(404, 'not found');
  const secret = Deno.env.get('POLAR_WEBHOOK_SECRET');
  const polar = polarFromEnv();
  if (!secret || !polar) {
    logUnexpected(
      'polar_webhook',
      null,
      new Error('POLAR_WEBHOOK_SECRET / POLAR_ACCESS_TOKEN / POLAR_SERVER not set'),
    );
    return plain(503, 'not configured');
  }

  const body = await req.text();
  const webhookId = req.headers.get('webhook-id');
  const valid = await verifyWebhook(
    secret,
    {
      id: webhookId,
      timestamp: req.headers.get('webhook-timestamp'),
      signature: req.headers.get('webhook-signature'),
    },
    body,
    Math.floor(Date.now() / 1000),
  );
  if (!valid || !webhookId) return plain(401, 'invalid signature');

  let event: { type?: unknown; data?: unknown };
  try {
    event = JSON.parse(body) as { type?: unknown; data?: unknown };
  } catch {
    return plain(400, 'bad request');
  }
  const type = typeof event.type === 'string' ? event.type.slice(0, 80) : '';
  const subscriptionId = subscriptionIdForEvent(type, event.data);
  if (!type || !subscriptionId) return plain(202, 'ignored');

  const db = serviceClient();
  const begin = await db.rpc('billing_begin_event', {
    p_webhook_id: webhookId,
    p_type: type,
    p_subscription_id: subscriptionId,
  });
  if (begin.error) {
    logUnexpected('polar_webhook', null, begin.error);
    return plain(500, 'error');
  }
  if ((begin.data as { process?: boolean } | null)?.process !== true)
    return plain(202, 'duplicate');

  const finish = (result: string, error: string | null, businessId: string | null) =>
    db.rpc('billing_finish_event', {
      p_webhook_id: webhookId,
      p_result: result,
      p_error: error,
      p_business_id: businessId,
    });

  try {
    const sub = await polar.getSubscription(subscriptionId);
    if (!sub.ok) {
      if (sub.status === 404) {
        await finish('subscription_not_found', null, null);
        return plain(202, 'ok');
      }
      throw new Error(`polar get subscription: ${sub.status} ${sub.error}`);
    }
    const snapshot = toSnapshot(sub.data);
    if (!snapshot) {
      await finish('invalid_snapshot', null, null);
      return plain(202, 'ok');
    }
    const applied = await applySnapshot(db, snapshot);
    if (!applied.ok || !applied.business_id) {
      // A refusal (unknown product, deleted business, ...): retrying would not change it.
      logUnexpected(
        'polar_webhook',
        null,
        new Error(`subscription ${subscriptionId} not applied: ${applied.code}`),
      );
      await finish(applied.code, null, applied.business_id ?? null);
      return plain(202, 'ok');
    }

    if (type === 'refund.created') {
      const d = event.data as Record<string, unknown>;
      const refund = await db.rpc('billing_record_refund', {
        p_business_id: applied.business_id,
        p_order_id: typeof d.order_id === 'string' ? d.order_id : '',
        p_subscription_id: subscriptionId,
        p_refunded_minor: typeof d.amount === 'number' ? d.amount : 0,
        p_currency: typeof d.currency === 'string' ? d.currency : '',
        p_reason: typeof d.reason === 'string' ? d.reason.slice(0, 40) : null,
      });
      if (refund.error) throw refund.error;
    }

    const fu = await runFollowups(followupDeps(db, polar), applied.business_id);
    if (fu.failed > 0) throw new Error(`${fu.failed} follow-up(s) failed`);

    await finish(applied.code, null, applied.business_id);
    return plain(202, 'ok');
  } catch (err) {
    logUnexpected('polar_webhook', null, err);
    await finish('error', err instanceof Error ? err.message.slice(0, 300) : 'error', null);
    return plain(500, 'error');
  }
});
