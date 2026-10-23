/**
 * Deno side of billing: the Polar client from Edge Function secrets, and the database calls the
 * follow-ups need (service role). Secrets: POLAR_ACCESS_TOKEN, POLAR_SERVER (sandbox |
 * production; dev uses sandbox), POLAR_WEBHOOK_SECRET (polar_webhook only). Missing -> null and
 * the caller answers "not configured".
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import type { FollowupDeps, Followup } from './followups.ts';
import { polarClient, type PolarClient, type PolarServer } from './polarClient.ts';
import type { Snapshot } from './snapshot.ts';

export function polarFromEnv(): PolarClient | null {
  const token = Deno.env.get('POLAR_ACCESS_TOKEN');
  const server = Deno.env.get('POLAR_SERVER');
  if (!token || (server !== 'sandbox' && server !== 'production')) return null;
  return polarClient({ token, server: server as PolarServer });
}

export type ApplyResult = { ok: boolean; code: string; business_id?: string };

export async function applySnapshot(db: SupabaseClient, snapshot: Snapshot): Promise<ApplyResult> {
  const { data, error } = await db.rpc('billing_apply_subscription', { p_snapshot: snapshot });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: r.ok === true,
    code: typeof r.code === 'string' ? r.code : 'unknown',
    business_id: typeof r.business_id === 'string' ? r.business_id : undefined,
  };
}

export function followupDeps(db: SupabaseClient, polar: PolarClient): FollowupDeps {
  return {
    polar,
    db: {
      async followups(businessId) {
        const { data, error } = await db.rpc('billing_followups', { p_business_id: businessId });
        if (error) throw error;
        return (Array.isArray(data) ? data : []) as Followup[];
      },
      async mark(subscriptionId, reason) {
        const { error } = await db.rpc('billing_mark_followup', {
          p_subscription_id: subscriptionId,
          p_reason: reason,
        });
        if (error) throw error;
      },
      async apply(snapshot) {
        await applySnapshot(db, snapshot);
      },
    },
  };
}
