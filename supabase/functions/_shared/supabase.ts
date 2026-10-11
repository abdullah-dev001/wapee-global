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

import { type BookableBranch } from './branchChoice.ts';

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
  /** Null when the branch has no address on file. */
  branchAddress: string | null;
  timezone: string;
  currency: string;
  countryCode: string;
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
 * slug -> the business id, or null for every "you cannot book here" case with NO distinction
 * between them (no such slug, soft-deleted, inactive, trial lapsed), so probing slugs reveals
 * nothing. `business_is_active()` semantics: status active, or trialing with trial_ends_at ahead.
 */
export async function resolveBusinessId(db: SupabaseClient, slug: string): Promise<string | null> {
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
  return active ? business.id : null;
}

/**
 * The business's BOOKABLE branches (`branch_is_bookable`), primary first: the locations a customer
 * may pick. Never includes archived branches or another business's branches.
 */
export async function listBookableBranches(
  db: SupabaseClient,
  businessId: string,
): Promise<BookableBranch[]> {
  const { data, error } = await db.rpc('get_bookable_branches', { p_business_id: businessId });
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    address: typeof row.address === 'string' && row.address.trim() !== '' ? row.address : null,
    timezone: String(row.timezone),
    currency: String(row.currency),
    countryCode: String(row.country_code),
    isPrimary: row.is_primary === true,
    code: String(row.code),
  }));
}

/**
 * business + branch id (or null = the primary) -> that branch with its booking settings, or null
 * when online booking is off or the branch does not belong to the business.
 */
export async function loadBranch(
  db: SupabaseClient,
  businessId: string,
  branchId: string | null,
): Promise<ResolvedBranch | null> {
  // One embedded select as ONE string literal — a concatenation makes
  // supabase-js infer GenericStringError instead of the row type
  // (context/_handoff.md).
  let query = db
    .from('branches')
    .select(
      'id, name, address, timezone, currency, country_code, business_id, is_primary, booking_settings(online_booking_enabled, staff_choice, slot_display, show_prices, booking_window_days, require_client_email, confirmation)',
    )
    .eq('business_id', businessId)
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
    branchAddress:
      typeof branch.address === 'string' && branch.address.trim() !== '' ? branch.address : null,
    timezone: branch.timezone,
    currency: branch.currency,
    countryCode: branch.country_code,
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

/**
 * slug (+ optional branch id) -> the branch to work with. With no branch id the PRIMARY branch is
 * used (old links and cached pages keep working); a branch id of another business simply does not
 * match, because the lookup is always scoped to the business the slug resolved to.
 *
 * Returns null for every "you cannot book here" case, with NO distinction between them.
 * The caller maps null to `not_bookable`.
 */
export async function resolveBranch(
  db: SupabaseClient,
  slug: string,
  branchId: string | null,
): Promise<ResolvedBranch | null> {
  const businessId = await resolveBusinessId(db, slug);
  if (!businessId) return null;
  return loadBranch(db, businessId, branchId);
}
