/**
 * POST /functions/v1/billing   (JWT required: the signed-in Owner)
 *
 *   { action, business_id, args? }
 *     checkout      { kind: plan|addon, key, interval }   -> { url } (Polar checkout)
 *     portal        {}                                   -> { url } (Polar customer portal)
 *     change_plan   { key, interval }
 *     change_seats  { seats }
 *     cancel | uncancel                                   the plan, at period end
 *     remove_addon | keep_addon { key }                   an add-on, at period end / undo
 *
 * Order, and why nothing can be skipped:
 *   1. billing_prepare AS THE CALLER: Owner only, rate limit, every rule; returns the exact call.
 *   2. checkout / change_plan: the Polar product must charge exactly the database price.
 *   3. the Polar call (service-side token, never in the app).
 *   4. a changed subscription is applied at once (so the screen is right without waiting for the
 *      webhook) and the follow-ups run; the webhook applies the same state again later (stale,
 *      no-op). A follow-up failure is not the caller's problem: the webhook / reconcile retry it.
 *
 * The caller can only name a business; prepare decides whether they may act on it.
 */

import { z } from 'npm:zod@3';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { logUnexpected } from '../_shared/response.ts';
import { siteUrl } from '../_shared/site.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { applySnapshot, followupDeps, polarFromEnv } from '../_shared/billing/env.ts';
import { runFollowups } from '../_shared/billing/followups.ts';
import type { PolarResult } from '../_shared/billing/polarClient.ts';
import { checkProductPrice } from '../_shared/billing/price.ts';
import { toSnapshot } from '../_shared/billing/snapshot.ts';

const RequestSchema = z
  .object({
    action: z.enum([
      'checkout',
      'portal',
      'change_plan',
      'change_seats',
      'cancel',
      'uncancel',
      'remove_addon',
      'keep_addon',
    ]),
    business_id: z.string().uuid(),
    args: z.record(z.unknown()).optional(),
  })
  .strict();

type Prepared = {
  ok?: boolean;
  code?: string;
  action?: string;
  business_id?: string;
  user_id?: string;
  subscription_id?: string;
  product_id?: string;
  kind?: 'plan' | 'addon';
  key?: string;
  interval?: 'month' | 'year';
  price_minor?: number;
  currency?: string;
  seats?: number | null;
  trial_days?: number | null;
  customer_email?: string | null;
  proration?: 'invoice' | 'prorate';
  cancel_at_period_end?: boolean;
  [extra: string]: unknown;
};

const STATUS: Record<string, number> = {
  forbidden: 403,
  invalid_input: 400,
  rate_limited: 429,
  not_configured: 503,
  polar_unavailable: 502,
};

function reply(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req.headers.get('origin')),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
const fail = (req: Request, code: string, extra: Record<string, unknown> = {}) =>
  reply(req, STATUS[code] ?? 409, { ok: false, code, ...extra });

/** A Polar refusal as a code the app can word. */
function polarCode(r: Exclude<PolarResult<unknown>, { ok: true }>): string {
  if (r.status === 402) return 'payment_failed';
  if (r.status === 403 || r.status === 409) return 'not_allowed';
  if (r.status === 429) return 'busy';
  return 'polar_unavailable';
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return fail(req, 'invalid_input');

  try {
    const polar = polarFromEnv();
    if (!polar) return fail(req, 'not_configured');
    const authHeader = req.headers.get('Authorization');
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!authHeader || !url || !anonKey) return fail(req, 'forbidden');

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail(req, 'invalid_input');
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return fail(req, 'invalid_input');
    const input = parsed.data;

    // 1. Ask the database, as the caller.
    const user = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const prep = await user.rpc('billing_prepare', {
      p_business_id: input.business_id,
      p_action: input.action,
      p_args: input.args ?? {},
    });
    if (prep.error) {
      if (prep.error.code === '42501') return fail(req, 'forbidden');
      throw prep.error;
    }
    const p = (prep.data ?? {}) as Prepared;
    if (p.ok !== true || !p.business_id) {
      const { ok: _ok, code, ...extra } = p;
      return fail(req, code ?? 'forbidden', extra);
    }
    const site = siteUrl();
    const billingUrl = `${site}/settings/billing`;

    // 2. The price Polar will charge must be the price the owner was shown.
    if ((p.action === 'checkout' || p.action === 'change_plan') && p.product_id) {
      const product = await polar.getProduct(p.product_id);
      if (!product.ok)
        return fail(req, product.status === 404 ? 'not_available' : polarCode(product));
      const check = checkProductPrice(product.data, {
        interval: p.interval ?? 'month',
        priceMinor: p.price_minor ?? -1,
        currency: p.currency ?? '',
        perSeat: typeof p.seats === 'number',
      });
      if (!check.ok) {
        logUnexpected('billing', null, new Error(`product ${p.product_id}: ${check.code}`));
        return fail(req, check.code);
      }
    }

    // 3. The Polar call.
    if (p.action === 'checkout') {
      const trial = typeof p.trial_days === 'number' && p.trial_days > 0 ? p.trial_days : 0;
      const checkout = await polar.createCheckout({
        products: [p.product_id],
        external_customer_id: p.business_id,
        ...(p.customer_email ? { customer_email: p.customer_email } : {}),
        metadata: {
          business_id: p.business_id,
          kind: p.kind,
          key: p.key,
          interval: p.interval,
          user_id: p.user_id,
        },
        success_url: `${billingUrl}?checkout=done&checkout_id={CHECKOUT_ID}`,
        return_url: billingUrl,
        allow_trial: trial > 0,
        ...(trial > 0
          ? { trial_interval: 'day', trial_interval_count: Math.min(trial, 1000) }
          : {}),
        ...(typeof p.seats === 'number' ? { seats: p.seats } : {}),
      });
      if (!checkout.ok || typeof checkout.data.url !== 'string') {
        return fail(req, checkout.ok ? 'polar_unavailable' : polarCode(checkout));
      }
      return reply(req, 200, { ok: true, data: { url: checkout.data.url } });
    }

    if (p.action === 'portal') {
      const session = await polar.createCustomerSession({
        external_customer_id: p.business_id,
        return_url: billingUrl,
      });
      if (!session.ok || typeof session.data.customer_portal_url !== 'string') {
        return fail(req, session.ok ? 'polar_unavailable' : polarCode(session));
      }
      return reply(req, 200, { ok: true, data: { url: session.data.customer_portal_url } });
    }

    const subId = p.subscription_id;
    if (!subId) return fail(req, 'no_subscription');
    let result: PolarResult<Record<string, unknown>>;
    if (p.action === 'change_plan') {
      result = await polar.updateSubscription(subId, {
        product_id: p.product_id,
        proration_behavior: p.proration,
      });
      // A per-location plan: then the seat count (a product change cannot carry seats).
      if (result.ok && typeof p.seats === 'number' && result.data.seats !== p.seats) {
        result = await polar.updateSubscription(subId, {
          seats: p.seats,
          proration_behavior: 'invoice',
        });
      }
    } else if (p.action === 'change_seats') {
      result = await polar.updateSubscription(subId, {
        seats: p.seats,
        proration_behavior: p.proration,
      });
    } else {
      result = await polar.updateSubscription(subId, {
        cancel_at_period_end: p.cancel_at_period_end === true,
      });
    }
    if (!result.ok) return fail(req, polarCode(result), { polar_error: result.error });

    // 4. Apply now, then the follow-ups (best effort; webhook and reconcile repeat them).
    const db = serviceClient();
    const snapshot = toSnapshot(result.data);
    if (snapshot) await applySnapshot(db, snapshot);
    try {
      await runFollowups(followupDeps(db, polar), p.business_id);
    } catch (err) {
      logUnexpected('billing', null, err);
    }
    return reply(req, 200, { ok: true, data: { action: p.action } });
  } catch (err) {
    logUnexpected('billing', null, err);
    return reply(req, 500, { ok: false, code: 'server_error' });
  }
});
