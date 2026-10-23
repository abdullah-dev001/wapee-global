/**
 * Polar API objects -> what the database applies. Pure.
 *
 * `toSnapshot` maps a Polar Subscription (GET /v1/subscriptions/{id}) to the snapshot
 * `billing_apply_subscription` validates. The database checks every field again; this only
 * renames. A recurring interval with a count other than 1 (e.g. every 3 months) is passed
 * through as `month*3` so the database refuses it (interval_mismatch) instead of guessing.
 *
 * `subscriptionIdForEvent` says which subscription a webhook is about, or null when the event
 * is not one we act on.
 */

export type PolarSubscription = {
  id?: unknown;
  status?: unknown;
  customer_id?: unknown;
  customer?: { external_id?: unknown } | null;
  metadata?: Record<string, unknown> | null;
  product_id?: unknown;
  recurring_interval?: unknown;
  recurring_interval_count?: unknown;
  seats?: unknown;
  cancel_at_period_end?: unknown;
  current_period_start?: unknown;
  current_period_end?: unknown;
  ended_at?: unknown;
  past_due_at?: unknown;
  created_at?: unknown;
  modified_at?: unknown;
};

export type Snapshot = {
  id: string;
  customer_id: string | null;
  external_customer_id: string | null;
  metadata_business_id: string | null;
  product_id: string | null;
  status: string | null;
  recurring_interval: string | null;
  seats: number | null;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  ended_at: string | null;
  past_due_at: string | null;
  created_at: string | null;
  modified_at: string | null;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function toSnapshot(sub: PolarSubscription | null | undefined): Snapshot | null {
  const id = str(sub?.id);
  if (!sub || !id) return null;
  const interval = str(sub.recurring_interval);
  const count = typeof sub.recurring_interval_count === 'number' ? sub.recurring_interval_count : 1;
  return {
    id,
    customer_id: str(sub.customer_id),
    external_customer_id: str(sub.customer?.external_id),
    metadata_business_id: str(sub.metadata?.business_id),
    product_id: str(sub.product_id),
    status: str(sub.status),
    recurring_interval: interval && count !== 1 ? `${interval}*${count}` : interval,
    seats: typeof sub.seats === 'number' ? sub.seats : null,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    current_period_start: str(sub.current_period_start),
    current_period_end: str(sub.current_period_end),
    ended_at: str(sub.ended_at),
    past_due_at: str(sub.past_due_at),
    created_at: str(sub.created_at),
    modified_at: str(sub.modified_at),
  };
}

/** The Polar subscription a webhook event is about, or null (event ignored). */
export function subscriptionIdForEvent(type: unknown, data: unknown): string | null {
  if (typeof type !== 'string' || typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (type.startsWith('subscription.')) return str(d.id);
  if (type === 'order.paid' || type === 'order.refunded' || type === 'refund.created') {
    return str(d.subscription_id);
  }
  return null;
}
