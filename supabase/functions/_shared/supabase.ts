/**
 * The service-role client, and slug resolution.
 *
 * WHY THE SERVICE ROLE
 * --------------------
 * `anon` has no table privileges and no policy on any booking table, and
 * `get_free_slots` / `create_booking` are granted to `service_role` only
 * (migrations 20261003110000, 20261003113000, 20261003160000). The public page
 * therefore cannot touch the database directly — by design. These functions are
 * the only path, and they hold the service-role key.
 *
 * The key is injected into hosted Edge Functions automatically and must never
 * reach the app (CLAUDE.md §6, §11).
 *
 * BECAUSE the service role bypasses RLS, everything below treats the request as
 * hostile: the slug is the only business identifier a caller may supply, and the
 * branch is always re-derived from it. A caller can never name a business_id.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    // A configuration error, not a request error. Thrown so the caller returns
    // `server_error` and the real reason is logged, never sent.
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ResolvedBranch = {
  businessId: string;
  branchId: string;
  branchName: string;
  timezone: string;
  currency: string;
  /** booking_settings the public page needs to render the flow. */
  settings: {
    staffChoice: 'hidden' | 'optional' | 'required';
    slotDisplay: 'only_available' | 'all_greyed';
    showPrices: boolean;
    bookingWindowDays: number;
    requireClientEmail: boolean;
    confirmation: 'auto' | 'manual';
  };
};

/**
 * slug (+ optional branch) -> the branch to work with.
 *
 * Returns null for every "you cannot book here" case, with NO distinction
 * between them, so probing slugs reveals nothing:
 *   - no such slug
 *   - the business is soft-deleted
 *   - the business is inactive or its trial lapsed
 *   - online booking is switched off for the branch
 *   - the branch does not belong to that slug
 *
 * The caller maps null to `not_bookable`.
 */
export async function resolveBranch(
  db: SupabaseClient,
  slug: string,
  branchId: string | null,
): Promise<ResolvedBranch | null> {
  // `business_is_active()` is the same helper RLS uses, so "active" means
  // exactly what it means everywhere else: status active, or trialing with
  // trial_ends_at in the future.
  const { data: business, error: bizErr } = await db
    .from('businesses')
    .select('id, status, trial_ends_at, deleted_at')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (bizErr) throw bizErr;
  if (!business) return null;

  const active =
    business.status === 'active' ||
    (business.status === 'trialing' &&
      business.trial_ends_at !== null &&
      new Date(business.trial_ends_at) > new Date());
  if (!active) return null;

  // One embedded select as ONE string literal — a concatenation makes
  // supabase-js infer GenericStringError instead of the row type
  // (context/_handoff.md).
  let query = db
    .from('branches')
    .select(
      'id, name, timezone, currency, business_id, is_primary, booking_settings(online_booking_enabled, staff_choice, slot_display, show_prices, booking_window_days, require_client_email, confirmation)',
    )
    .eq('business_id', business.id)
    .is('deleted_at', null);

  query = branchId ? query.eq('id', branchId) : query.order('is_primary', { ascending: false });

  const { data: branches, error: brErr } = await query.limit(1);
  if (brErr) throw brErr;

  const branch = branches?.[0];
  if (!branch) return null;

  // The embed is an array in the generated types even for a 1:1 relation.
  const settings = Array.isArray(branch.booking_settings)
    ? branch.booking_settings[0]
    : branch.booking_settings;

  if (!settings || settings.online_booking_enabled !== true) return null;

  return {
    businessId: branch.business_id,
    branchId: branch.id,
    branchName: branch.name,
    timezone: branch.timezone,
    currency: branch.currency,
    settings: {
      staffChoice: settings.staff_choice,
      slotDisplay: settings.slot_display,
      showPrices: settings.show_prices,
      bookingWindowDays: settings.booking_window_days,
      requireClientEmail: settings.require_client_email,
      confirmation: settings.confirmation,
    },
  };
}
