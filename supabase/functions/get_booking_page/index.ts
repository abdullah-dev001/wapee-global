/**
 * POST /functions/v1/get_booking_page
 *
 * The public booking page's bootstrap call. Takes a business SLUG — never a
 * business_id — and returns everything the page needs to render step 1 (choose
 * a service) before it knows which service the customer will pick:
 *
 *   - branch display info (name, timezone, currency)
 *   - booking settings the page needs (staff_choice, slot_display, show_prices,
 *     require_client_email, confirmation)
 *   - the bookable services (with price, when shown) and staff list
 *   - which staff perform which service, so step 2 can be filtered
 *   - the published custom-field form, in snapshot shape (the same shape
 *     `create_booking` will validate answers against)
 *   - whether the branch is actually bookable right now (`branch_is_bookable`),
 *     so the page can show "not available" instead of an empty flow
 *
 * Request
 *   { slug: string, branch_id?: uuid, branch?: string }
 *   `branch` is a branch id OR its short code (the invoice prefix), from `?branch=` in the link.
 *
 * Response
 *   { ok: true, data: { needs_branch, branches, branch, settings, services, staff, service_staff, fields } }
 *   { ok: false, code: 'not_bookable' | 'rate_limited' | 'bad_request' | 'server_error' }
 *
 * Which branch (pure rule in `_shared/branchChoice.ts`): a matching id / code wins; otherwise the
 * only bookable branch, or - with two or more - `needs_branch: true` and just the `branches` list
 * (the page shows a picker). Nothing bookable is the identical `not_bookable`.
 *
 * Same posture as `get_slots`: the branch is always looked up inside the business the slug
 * resolved to (a foreign id never matches), the response is mapped field by field (never
 * spread), and a slug that cannot be booked for ANY reason returns the identical `not_bookable`.
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { chooseBranch } from '../_shared/branchChoice.ts';
import {
  listBookableBranches,
  loadBranch,
  resolveBusinessId,
  serviceClient,
} from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const RequestSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'invalid slug'),
    branch_id: z.string().uuid().nullish(),
    branch: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/, 'invalid branch')
      .nullish(),
  })
  .strict();

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  let slug: string | null = null;

  try {
    const db = serviceClient();

    const limit = await checkRateLimit(req, db, 'get_booking_page');
    if (!limit.allowed) {
      return jsonError(req, 'rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, 'bad_request');
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(req, 'bad_request');
    const input = parsed.data;
    slug = input.slug;

    const businessId = await resolveBusinessId(db, input.slug);
    if (!businessId) return jsonError(req, 'not_bookable');

    // Only branches that pass branch_is_bookable() are ever offered.
    const bookable = await listBookableBranches(db, businessId);
    const choice = chooseBranch(bookable, input.branch ?? input.branch_id ?? null);
    if (choice.kind === 'none') return jsonError(req, 'not_bookable');

    const publicBranches = bookable.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      timezone: b.timezone,
      code: b.code,
    }));

    if (choice.kind === 'choose') {
      return jsonOk(req, { needs_branch: true, branches: publicBranches, branch: null });
    }

    const branch = await loadBranch(db, businessId, choice.branch.id);
    if (!branch) return jsonError(req, 'not_bookable');

    // The branch already passed branch_is_bookable() in the list above, so the
    // catalogue is the only call left. A branch that is not set up is reported
    // like an unresolvable slug (see the `none` case), never as "exists but empty".
    const { data: catalogue, error: catErr } = await db.rpc('get_booking_page_catalogue', {
      p_branch_id: branch.branchId,
    });
    if (catErr) throw catErr;

    const data = catalogue as {
      services: Array<{
        id: string;
        name: string;
        duration_minutes: number;
        price_minor: number;
        category_name: string | null;
      }>;
      staff: Array<{ id: string; display_name: string }>;
      service_staff: Array<{ service_id: string; staff_id: string }>;
      fields: Array<{
        id: string;
        label: string;
        field_type: string;
        help_text: string | null;
        is_required: boolean;
        is_sensitive: boolean;
        applies_to_all_services: boolean;
        options: string[] | null;
        sort_order: number;
        service_ids: string[];
      }>;
    };

    const showStaff = branch.settings.staffChoice !== 'hidden';

    return jsonOk(req, {
      needs_branch: false,
      branches: publicBranches,
      branch: {
        id: branch.branchId,
        name: branch.branchName,
        address: branch.branchAddress,
        timezone: branch.timezone,
        currency: branch.currency,
        country_code: branch.countryCode,
      },
      settings: {
        staff_choice: branch.settings.staffChoice,
        slot_display: branch.settings.slotDisplay,
        show_prices: branch.settings.showPrices,
        booking_window_days: branch.settings.bookingWindowDays,
        require_client_email: branch.settings.requireClientEmail,
        confirmation: branch.settings.confirmation,
      },
      // Mapped field by field, never spread: a column added to the catalogue
      // RPC later must not reach the public page by default.
      services: data.services.map((s) => ({
        id: s.id,
        name: s.name,
        duration_minutes: s.duration_minutes,
        category_name: s.category_name,
        ...(branch.settings.showPrices ? { price_minor: s.price_minor } : {}),
      })),
      staff: showStaff ? data.staff.map((s) => ({ id: s.id, display_name: s.display_name })) : [],
      service_staff: showStaff ? data.service_staff : [],
      fields: data.fields.map((f) => ({
        id: f.id,
        label: f.label,
        field_type: f.field_type,
        help_text: f.help_text,
        is_required: f.is_required,
        // Sensitive is not surfaced: the public page has no reason to know a
        // field is sensitive, it only collects the answer.
        applies_to_all_services: f.applies_to_all_services,
        options: f.options,
        service_ids: f.service_ids,
      })),
    });
  } catch (err) {
    logUnexpected('get_booking_page', slug, err);
    return jsonError(req, 'server_error');
  }
});
