/**
 * POST /functions/v1/billing_reconcile — daily safety net (cron `billing-reconcile`, 03:17 UTC),
 * verify_jwt = false; the call carries the outbox worker token (`outbox_worker_authorize`),
 * anything else gets 404.
 *
 * A missed or disabled webhook must never leave a paying business locked or an unpaid one open:
 *   1. page through every Polar subscription and apply it (unchanged ones are 'stale', no-op);
 *   2. re-read any subscription we still hold as live / recently ended that the listing missed;
 *   3. run the follow-ups for every business with a live subscription;
 *   4. delete webhook delivery rows older than 90 days.
 * Stops after ~50 s; the next run continues. Only counts are returned.
 */

import { logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { applySnapshot, followupDeps, polarFromEnv } from '../_shared/billing/env.ts';
import { runFollowups } from '../_shared/billing/followups.ts';
import { toSnapshot } from '../_shared/billing/snapshot.ts';

const BUDGET_MS = 50_000;
const MAX_PAGES = 20;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(404, { ok: false });
  const db = serviceClient();
  try {
    const { data: authorized, error: authErr } = await db.rpc('outbox_worker_authorize', {
      p_token: req.headers.get('x-worker-token') ?? '',
    });
    if (authErr) throw authErr;
    if (authorized !== true) return json(404, { ok: false });

    const polar = polarFromEnv();
    if (!polar) return json(200, { ok: true, skipped: 'not_configured' });

    const started = Date.now();
    const seen = new Set<string>();
    const counts: Record<string, number> = {};
    const tally = (code: string) => (counts[code] = (counts[code] ?? 0) + 1);

    // 1. Everything Polar has.
    for (let page = 1; page <= MAX_PAGES && Date.now() - started < BUDGET_MS; page += 1) {
      const list = await polar.listSubscriptions({ page, limit: 100 });
      if (!list.ok) throw new Error(`polar list subscriptions: ${list.status} ${list.error}`);
      for (const sub of list.data.items) {
        const snapshot = toSnapshot(sub);
        if (!snapshot) continue;
        seen.add(snapshot.id);
        tally((await applySnapshot(db, snapshot)).code);
      }
      if (page >= list.data.pagination.max_page) break;
    }

    // 2. What we hold that the listing did not show.
    const { data: targets, error: tErr } = await db.rpc('billing_reconcile_targets');
    if (tErr) throw tErr;
    const t = (targets ?? {}) as { subscriptions?: string[]; businesses?: string[] };
    for (const id of t.subscriptions ?? []) {
      if (seen.has(id) || Date.now() - started > BUDGET_MS) continue;
      const sub = await polar.getSubscription(id);
      if (!sub.ok) {
        tally(`get_${sub.status}`);
        continue;
      }
      const snapshot = toSnapshot(sub.data);
      if (snapshot) tally((await applySnapshot(db, snapshot)).code);
    }

    // 3. Follow-ups.
    let followupsFailed = 0;
    for (const businessId of t.businesses ?? []) {
      if (Date.now() - started > BUDGET_MS) break;
      followupsFailed += (await runFollowups(followupDeps(db, polar), businessId)).failed;
    }

    // 4. Old delivery rows.
    const { data: deleted, error: cErr } = await db.rpc('billing_cleanup_events');
    if (cErr) throw cErr;

    if (followupsFailed > 0) {
      logUnexpected('billing_reconcile', null, new Error(`${followupsFailed} follow-up(s) failed`));
    }
    return json(200, {
      ok: true,
      applied: counts,
      followups_failed: followupsFailed,
      events_deleted: deleted,
    });
  } catch (err) {
    logUnexpected('billing_reconcile', null, err);
    return json(500, { ok: false });
  }
});
