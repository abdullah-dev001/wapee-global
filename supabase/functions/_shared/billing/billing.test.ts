import { describe, expect, it } from 'vitest';

import { runFollowups, type Followup, type FollowupDeps } from './followups.ts';
import { polarClient } from './polarClient.ts';
import { checkProductPrice } from './price.ts';
import { subscriptionIdForEvent, toSnapshot } from './snapshot.ts';
import { signWebhook, verifyWebhook, WEBHOOK_TOLERANCE_SECONDS } from './webhookSignature.ts';

// A test secret in the Standard Webhooks format (not a real key).
const SECRET = `whsec_${btoa('test-secret-for-unit-tests-0123456789')}`;
const NOW = 1_792_000_000;
const BODY = '{"type":"subscription.updated","data":{"id":"sub_1"}}';

describe('verifyWebhook', () => {
  it('accepts a correct signature', async () => {
    const signature = await signWebhook(SECRET, 'msg_1', NOW, BODY);
    expect(
      await verifyWebhook(SECRET, { id: 'msg_1', timestamp: String(NOW), signature }, BODY, NOW),
    ).toBe(true);
  });

  it('accepts when one of several signatures matches', async () => {
    const good = await signWebhook(SECRET, 'msg_1', NOW, BODY);
    const signature = `v1,AAAA ${good}`;
    expect(
      await verifyWebhook(SECRET, { id: 'msg_1', timestamp: String(NOW), signature }, BODY, NOW),
    ).toBe(true);
  });

  it('refuses a changed body, id or timestamp', async () => {
    const signature = await signWebhook(SECRET, 'msg_1', NOW, BODY);
    const h = { id: 'msg_1', timestamp: String(NOW), signature };
    expect(await verifyWebhook(SECRET, h, BODY.replace('sub_1', 'sub_2'), NOW)).toBe(false);
    expect(await verifyWebhook(SECRET, { ...h, id: 'msg_2' }, BODY, NOW)).toBe(false);
    expect(await verifyWebhook(SECRET, { ...h, timestamp: String(NOW + 1) }, BODY, NOW)).toBe(
      false,
    );
  });

  it('refuses another secret', async () => {
    const signature = await signWebhook(
      `whsec_${btoa('another-secret-entirely-xyz')}`,
      'msg_1',
      NOW,
      BODY,
    );
    expect(
      await verifyWebhook(SECRET, { id: 'msg_1', timestamp: String(NOW), signature }, BODY, NOW),
    ).toBe(false);
  });

  it('refuses a timestamp outside the 5-minute window (replay)', async () => {
    const old = NOW - WEBHOOK_TOLERANCE_SECONDS - 1;
    const signature = await signWebhook(SECRET, 'msg_1', old, BODY);
    expect(
      await verifyWebhook(SECRET, { id: 'msg_1', timestamp: String(old), signature }, BODY, NOW),
    ).toBe(false);
  });

  it('refuses missing headers, a malformed timestamp or secret', async () => {
    const signature = await signWebhook(SECRET, 'msg_1', NOW, BODY);
    expect(
      await verifyWebhook(SECRET, { id: null, timestamp: String(NOW), signature }, BODY, NOW),
    ).toBe(false);
    expect(
      await verifyWebhook(SECRET, { id: 'msg_1', timestamp: 'soon', signature }, BODY, NOW),
    ).toBe(false);
    expect(
      await verifyWebhook(
        SECRET,
        { id: 'msg_1', timestamp: String(NOW), signature: null },
        BODY,
        NOW,
      ),
    ).toBe(false);
    expect(
      await verifyWebhook(
        'not-a-secret',
        { id: 'msg_1', timestamp: String(NOW), signature },
        BODY,
        NOW,
      ),
    ).toBe(false);
  });
});

const SUB = {
  id: 'sub_1',
  status: 'active',
  customer_id: 'cus_1',
  customer: { external_id: 'biz-uuid' },
  metadata: { business_id: 'biz-uuid' },
  product_id: 'prod_1',
  recurring_interval: 'month',
  recurring_interval_count: 1,
  seats: null,
  cancel_at_period_end: false,
  current_period_start: '2026-10-01T00:00:00Z',
  current_period_end: '2026-11-01T00:00:00Z',
  ended_at: null,
  past_due_at: null,
  created_at: '2026-10-01T00:00:00Z',
  modified_at: '2026-10-02T00:00:00Z',
};

describe('toSnapshot', () => {
  it('maps a Polar subscription to the database snapshot', () => {
    expect(toSnapshot(SUB)).toEqual({
      id: 'sub_1',
      customer_id: 'cus_1',
      external_customer_id: 'biz-uuid',
      metadata_business_id: 'biz-uuid',
      product_id: 'prod_1',
      status: 'active',
      recurring_interval: 'month',
      seats: null,
      cancel_at_period_end: false,
      current_period_start: '2026-10-01T00:00:00Z',
      current_period_end: '2026-11-01T00:00:00Z',
      ended_at: null,
      past_due_at: null,
      created_at: '2026-10-01T00:00:00Z',
      modified_at: '2026-10-02T00:00:00Z',
    });
  });

  it('passes an unusual interval through so the database refuses it', () => {
    expect(toSnapshot({ ...SUB, recurring_interval_count: 3 })?.recurring_interval).toBe('month*3');
  });

  it('keeps seats, nulls odd types, and needs an id', () => {
    expect(toSnapshot({ ...SUB, seats: 4 })?.seats).toBe(4);
    expect(toSnapshot({ ...SUB, cancel_at_period_end: 'yes' })?.cancel_at_period_end).toBe(false);
    expect(toSnapshot({ ...SUB, customer: null })?.external_customer_id).toBeNull();
    expect(toSnapshot({ ...SUB, id: '' })).toBeNull();
    expect(toSnapshot(null)).toBeNull();
  });
});

describe('subscriptionIdForEvent', () => {
  it('finds the subscription of the events we act on', () => {
    expect(subscriptionIdForEvent('subscription.updated', { id: 'sub_1' })).toBe('sub_1');
    expect(subscriptionIdForEvent('subscription.revoked', { id: 'sub_1' })).toBe('sub_1');
    expect(subscriptionIdForEvent('order.paid', { id: 'ord_1', subscription_id: 'sub_1' })).toBe(
      'sub_1',
    );
    expect(
      subscriptionIdForEvent('refund.created', { id: 'ref_1', subscription_id: 'sub_1' }),
    ).toBe('sub_1');
  });

  it('ignores the rest (one-time orders, checkouts, customers, junk)', () => {
    expect(subscriptionIdForEvent('order.paid', { id: 'ord_1', subscription_id: null })).toBeNull();
    expect(subscriptionIdForEvent('checkout.updated', { id: 'chk_1' })).toBeNull();
    expect(subscriptionIdForEvent('customer.updated', { id: 'cus_1' })).toBeNull();
    expect(subscriptionIdForEvent(42, { id: 'x' })).toBeNull();
    expect(subscriptionIdForEvent('subscription.updated', null)).toBeNull();
  });
});

const PRODUCT = {
  id: 'prod_1',
  is_archived: false,
  is_recurring: true,
  recurring_interval: 'month',
  recurring_interval_count: 1,
  prices: [{ amount_type: 'fixed', is_archived: false, price_currency: 'usd', price_amount: 3900 }],
};
const SEAT_PRODUCT = {
  ...PRODUCT,
  prices: [
    {
      amount_type: 'seat_based',
      is_archived: false,
      price_currency: 'usd',
      seat_tiers: { tiers: [{ min_seats: 1, max_seats: null, price_per_seat: 7900 }] },
    },
  ],
};

describe('checkProductPrice', () => {
  const want = { interval: 'month' as const, priceMinor: 3900, currency: 'USD', perSeat: false };

  it('accepts the exact database price', () => {
    expect(checkProductPrice(PRODUCT, want)).toEqual({ ok: true });
    expect(checkProductPrice(SEAT_PRODUCT, { ...want, priceMinor: 7900, perSeat: true })).toEqual({
      ok: true,
    });
  });

  it('refuses another amount, currency or interval', () => {
    expect(checkProductPrice(PRODUCT, { ...want, priceMinor: 3800 })).toEqual({
      ok: false,
      code: 'price_mismatch',
    });
    expect(checkProductPrice(PRODUCT, { ...want, currency: 'EUR' })).toEqual({
      ok: false,
      code: 'price_mismatch',
    });
    expect(checkProductPrice(PRODUCT, { ...want, interval: 'year' })).toEqual({
      ok: false,
      code: 'price_mismatch',
    });
    expect(checkProductPrice({ ...PRODUCT, recurring_interval_count: 3 }, want)).toEqual({
      ok: false,
      code: 'price_mismatch',
    });
  });

  it('refuses a per-seat product used as fixed and the other way round', () => {
    expect(checkProductPrice(SEAT_PRODUCT, { ...want, priceMinor: 7900 })).toEqual({
      ok: false,
      code: 'price_mismatch',
    });
    expect(checkProductPrice(PRODUCT, { ...want, perSeat: true })).toEqual({
      ok: false,
      code: 'price_mismatch',
    });
  });

  it('refuses tiered seat prices and ambiguous price lists', () => {
    const tiered = {
      ...SEAT_PRODUCT,
      prices: [
        {
          ...SEAT_PRODUCT.prices[0],
          seat_tiers: { tiers: [{ price_per_seat: 7900 }, { price_per_seat: 6900 }] },
        },
      ],
    };
    expect(checkProductPrice(tiered, { ...want, priceMinor: 7900, perSeat: true })).toEqual({
      ok: false,
      code: 'price_mismatch',
    });
    const two = {
      ...PRODUCT,
      prices: [PRODUCT.prices[0], { ...PRODUCT.prices[0], price_amount: 100 }],
    };
    expect(checkProductPrice(two, want)).toEqual({ ok: false, code: 'price_mismatch' });
  });

  it('ignores archived prices; an archived product is not available', () => {
    const withOld = {
      ...PRODUCT,
      prices: [{ ...PRODUCT.prices[0], price_amount: 100, is_archived: true }, PRODUCT.prices[0]],
    };
    expect(checkProductPrice(withOld, want)).toEqual({ ok: true });
    expect(checkProductPrice({ ...PRODUCT, is_archived: true }, want)).toEqual({
      ok: false,
      code: 'not_available',
    });
    expect(checkProductPrice(null, want)).toEqual({ ok: false, code: 'not_available' });
  });
});

describe('polarClient', () => {
  type Seen = { url: string; method: string; auth: string | null; body: string | null };
  function fakeFetch(status: number, json: unknown, seen: Seen[]) {
    return async (input: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      seen.push({
        url: input,
        method: init.method ?? 'GET',
        auth: headers.get('Authorization'),
        body: (init.body as string) ?? null,
      });
      return new Response(JSON.stringify(json), { status });
    };
  }

  it('calls the sandbox API with the bearer token', async () => {
    const seen: Seen[] = [];
    const c = polarClient({
      token: 'tok',
      server: 'sandbox',
      fetchFn: fakeFetch(200, { id: 'sub_1' }, seen),
    });
    const r = await c.updateSubscription('sub_1', { cancel_at_period_end: true });
    expect(r).toEqual({ ok: true, data: { id: 'sub_1' } });
    expect(seen[0]).toEqual({
      url: 'https://sandbox-api.polar.sh/v1/subscriptions/sub_1',
      method: 'PATCH',
      auth: 'Bearer tok',
      body: '{"cancel_at_period_end":true}',
    });
  });

  it('uses the production API and query strings', async () => {
    const seen: Seen[] = [];
    const c = polarClient({
      token: 'tok',
      server: 'production',
      fetchFn: fakeFetch(200, { items: [] }, seen),
    });
    await c.listOrders({ subscription_id: 'sub 1', page: 2, limit: 100 });
    expect(seen[0]?.url).toBe(
      'https://api.polar.sh/v1/orders/?subscription_id=sub+1&page=2&limit=100',
    );
  });

  it("returns Polar's error name, never the body", async () => {
    const c = polarClient({
      token: 'tok',
      server: 'sandbox',
      fetchFn: fakeFetch(
        402,
        { error: 'PaymentFailed', detail: 'card of jane@example.com declined' },
        [],
      ),
    });
    expect(await c.updateSubscription('sub_1', { seats: 2 })).toEqual({
      ok: false,
      status: 402,
      error: 'PaymentFailed',
    });
  });

  it('turns a network failure into status 0', async () => {
    const c = polarClient({
      token: 'tok',
      server: 'sandbox',
      fetchFn: async () => {
        throw new Error('boom');
      },
    });
    expect(await c.getSubscription('sub_1')).toEqual({ ok: false, status: 0, error: 'network' });
  });
});

describe('runFollowups', () => {
  type Call = string;
  function deps(list: Followup[]) {
    const calls: Call[] = [];
    const ok = (data: Record<string, unknown>) => ({ ok: true as const, data });
    const d: FollowupDeps = {
      polar: {
        updateSubscription: async (id, body) => {
          calls.push(`patch ${id} ${JSON.stringify(body)}`);
          return ok({ ...SUB, id, cancel_at_period_end: body.cancel_at_period_end === true });
        },
        revokeSubscription: async (id) => {
          calls.push(`revoke ${id}`);
          return ok({ ...SUB, id, status: 'canceled' });
        },
        getSubscription: async (id) => {
          calls.push(`get ${id}`);
          return ok({ ...SUB, id, status: 'canceled' });
        },
        listOrders: async ({ subscription_id }) => {
          calls.push(`orders ${subscription_id}`);
          return ok({
            items: [
              { id: 'ord_1', paid: true, refundable_amount: 3900 },
              { id: 'ord_2', paid: true, refundable_amount: 0 },
              { id: 'ord_3', paid: false, refundable_amount: 100 },
            ],
            pagination: { total_count: 3, max_page: 1 },
          }) as never;
        },
        createRefund: async (body) => {
          calls.push(`refund ${body.order_id} ${body.amount} ${body.reason}`);
          return ok({ id: 'ref_1' });
        },
      },
      db: {
        followups: async () => list,
        mark: async (id, reason) => {
          calls.push(`mark ${id} ${reason}`);
        },
        apply: async (s) => {
          calls.push(`apply ${s.id} ${s.status} ${s.cancel_at_period_end}`);
        },
      },
    };
    return { d, calls };
  }

  it('cancels / uncancels at period end, applies and marks', async () => {
    const { d, calls } = deps([
      { subscription_id: 'a', action: 'cancel', reason: 'plan_cancel', refund: false },
      { subscription_id: 'b', action: 'uncancel', reason: 'plan_cancel', refund: false },
    ]);
    expect(await runFollowups(d, 'biz')).toEqual({ done: 2, failed: 0 });
    expect(calls).toEqual([
      'patch a {"cancel_at_period_end":true}',
      'apply a active true',
      'mark a plan_cancel',
      'patch b {"cancel_at_period_end":false}',
      'apply b active false',
      'mark b null',
    ]);
  });

  it('refunds every paid order of a duplicate BEFORE revoking it', async () => {
    const { d, calls } = deps([
      { subscription_id: 'dup', action: 'revoke', reason: 'duplicate', refund: true },
    ]);
    expect(await runFollowups(d, 'biz')).toEqual({ done: 1, failed: 0 });
    expect(calls).toEqual([
      'orders dup',
      'refund ord_1 3900 duplicate',
      'revoke dup',
      'apply dup canceled false',
      'mark dup duplicate',
    ]);
  });

  it('a failed refund stops that revoke (retried next run), the rest go on', async () => {
    const { d, calls } = deps([
      { subscription_id: 'dup', action: 'revoke', reason: 'duplicate', refund: true },
      { subscription_id: 'a', action: 'revoke', reason: 'plan_ended', refund: false },
    ]);
    d.polar.createRefund = async () => ({ ok: false, status: 500, error: 'http_500' });
    expect(await runFollowups(d, 'biz')).toEqual({ done: 1, failed: 1 });
    expect(calls).not.toContain('revoke dup');
    expect(calls).toContain('revoke a');
  });

  it('an already revoked subscription is read and recorded, not failed', async () => {
    const { d, calls } = deps([
      { subscription_id: 'a', action: 'revoke', reason: 'plan_ended', refund: false },
    ]);
    d.polar.revokeSubscription = async (id) => {
      calls.push(`revoke ${id}`);
      return { ok: false, status: 403, error: 'AlreadyCanceledSubscription' };
    };
    expect(await runFollowups(d, 'biz')).toEqual({ done: 1, failed: 0 });
    expect(calls).toEqual(['revoke a', 'get a', 'apply a canceled false', 'mark a plan_ended']);
  });

  it('a Polar refusal is counted as failed and nothing is marked', async () => {
    const { d, calls } = deps([
      { subscription_id: 'a', action: 'cancel', reason: 'plan_change', refund: false },
    ]);
    d.polar.updateSubscription = async () => ({
      ok: false,
      status: 409,
      error: 'SubscriptionLocked',
    });
    expect(await runFollowups(d, 'biz')).toEqual({ done: 0, failed: 1 });
    expect(calls).toEqual([]);
  });
});
