/**
 * Carries out `billing_followups(business)` in Polar so add-ons follow the plan automatically
 * (and duplicates are refunded and revoked). I/O comes in as deps, so this is unit-testable.
 *
 *   cancel    PATCH cancel_at_period_end: true   -> apply -> mark(reason)
 *   uncancel  PATCH cancel_at_period_end: false  -> apply -> mark(null)
 *   revoke    (refund first, when asked: every paid order's refundable amount) -> DELETE
 *             -> apply -> mark(reason)
 *
 * Refund BEFORE revoke: if the revoke then fails, the subscription is still live, the follow-up
 * comes back next run, finds nothing left to refund, and revokes. The other way round, a failed
 * refund after a revoke would never be retried (an ended subscription is no longer listed).
 * One failure never stops the rest; the caller learns how many failed.
 */

import type { PolarClient } from './polarClient.ts';
import { toSnapshot, type Snapshot } from './snapshot.ts';

export type Followup = {
  subscription_id: string;
  action: 'cancel' | 'uncancel' | 'revoke';
  reason: 'plan_cancel' | 'plan_change' | 'plan_ended' | 'duplicate';
  refund: boolean;
};

export type FollowupDeps = {
  polar: Pick<
    PolarClient,
    'updateSubscription' | 'revokeSubscription' | 'getSubscription' | 'listOrders' | 'createRefund'
  >;
  db: {
    followups: (businessId: string) => Promise<Followup[]>;
    mark: (subscriptionId: string, reason: string | null) => Promise<void>;
    apply: (snapshot: Snapshot) => Promise<void>;
  };
};

export type FollowupResult = { done: number; failed: number };

async function refundAll(polar: FollowupDeps['polar'], subscriptionId: string): Promise<boolean> {
  for (let page = 1; page <= 10; page += 1) {
    const orders = await polar.listOrders({ subscription_id: subscriptionId, page, limit: 100 });
    if (!orders.ok) return false;
    for (const order of orders.data.items) {
      const amount = typeof order.refundable_amount === 'number' ? order.refundable_amount : 0;
      if (order.paid !== true || amount <= 0 || typeof order.id !== 'string') continue;
      const refund = await polar.createRefund({
        order_id: order.id,
        reason: 'duplicate',
        amount,
        comment: 'Automatic: a second subscription for the same business.',
      });
      if (!refund.ok && refund.error !== 'RefundedAlready') return false;
    }
    if (page >= orders.data.pagination.max_page) break;
  }
  return true;
}

export async function runFollowups(
  deps: FollowupDeps,
  businessId: string,
): Promise<FollowupResult> {
  const list = await deps.db.followups(businessId);
  let done = 0;
  let failed = 0;
  for (const f of list) {
    try {
      let result;
      if (f.action === 'revoke') {
        if (f.refund && !(await refundAll(deps.polar, f.subscription_id))) {
          failed += 1;
          continue;
        }
        result = await deps.polar.revokeSubscription(f.subscription_id);
        // Already revoked elsewhere: read the current state and carry on.
        if (!result.ok && result.error === 'AlreadyCanceledSubscription') {
          result = await deps.polar.getSubscription(f.subscription_id);
        }
      } else {
        result = await deps.polar.updateSubscription(f.subscription_id, {
          cancel_at_period_end: f.action === 'cancel',
        });
      }
      if (!result.ok) {
        failed += 1;
        continue;
      }
      const snapshot = toSnapshot(result.data);
      if (snapshot) await deps.db.apply(snapshot);
      await deps.db.mark(f.subscription_id, f.action === 'uncancel' ? null : f.reason);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  return { done, failed };
}
