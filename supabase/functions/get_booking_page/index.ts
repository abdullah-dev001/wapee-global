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
 *   { slug: string, branch_id?: uuid }
 *
 * Response
 *   { ok: true, data: { branch, settings, services, staff, service_staff, fields } }
 *   { ok: false, code: 'not_bookable' | 'rate_limited' | 'bad_request' | 'server_error' }
 *
 * Same posture as `get_slots`: `resolveBranch` is the only way a slug becomes a
 * branch, the response is mapped field by field (never spread), and a slug that
 * cannot be booked for ANY reason returns the identical `not_bookable`.
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { resolveBranch, serviceClient } from '../_shared/supabase.ts';
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

    const branch = await resolveBranch(db, input.slug, input.branch_id ?? null);
    if (!branch) return jsonError(req, 'not_bookable');

    const [{ data: catalogue, error: catErr }, { data: bookable, error: bookableErr }] =
      await Promise.all([
        db.rpc('get_booking_page_catalogue', { p_branch_id: branch.branchId }),
        db.rpc('branch_is_bookable', { p_branch_id: branch.branchId }),
      ]);

    if (catErr) throw catErr;
    if (bookableErr) throw bookableErr;

    // A branch that fails its own bookability check is reported the same as an
    // unresolvable slug: the page has nothing useful to offer either way, and
    // this keeps "exists but not set up" indistinguishable from "does not
    // exist" to a stranger, same as resolveBranch already does for trial/active.
    const isBookable = (bookable as { bookable?: boolean } | null)?.bookable === true;
    if (!isBookable) return jsonError(req, 'not_bookable');

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
      branch: {
        name: branch.branchName,
        timezone: branch.timezone,
        currency: branch.currency,
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
