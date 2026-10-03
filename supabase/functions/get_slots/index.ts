/**
 * POST /functions/v1/get_slots
 *
 * The public booking page asks for free slots. Takes a business SLUG — never a
 * business_id — and returns only what the page needs to draw a time picker.
 *
 * Request
 *   {
 *     slug: string,                 // from the URL, e.g. /nova-hair-studio
 *     service_id: uuid,
 *     branch_id?: uuid,             // defaults to the primary branch
 *     staff_id?: uuid,              // omit for "Any staff"
 *     from_date: 'YYYY-MM-DD',      // LOCAL dates at the branch
 *     to_date: 'YYYY-MM-DD'
 *   }
 *
 * Response
 *   { ok: true, data: { timezone, branch_name, currency, settings, slots: [...] } }
 *
 * PRIVACY: a slot carries `starts_at`, the local date/minute, `available`, and —
 * only when the branch lets customers choose — `staff_id` and `staff_name`.
 * It never carries a resource id, a seat count, a client, or anything about who
 * booked an unavailable slot.
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { resolveBranch, serviceClient } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { issueStartToken } from '../_shared/startToken.ts';

/** A calendar date, not an instant: the engine works on local dates. */
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const RequestSchema = z
  .object({
    // Slug rules mirror the DB: lowercase, digits, hyphens (see the slug guard
    // in 20261001183000_businesses_branches.sql).
    slug: z
      .string()
      .trim()
      .min(1)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'invalid slug'),
    service_id: z.string().uuid(),
    branch_id: z.string().uuid().nullish(),
    staff_id: z.string().uuid().nullish(),
    from_date: localDate,
    to_date: localDate,
  })
  .strict() // an unexpected key is a bug or a probe; either way, reject it
  .refine((v) => v.from_date <= v.to_date, {
    message: 'from_date must not be after to_date',
    path: ['from_date'],
  })
  .refine(
    (v) => {
      // A bounded range, so one request cannot ask the engine to scan years.
      // The booking window is enforced again in the DB; this is the cheap guard
      // that stops the work ever starting.
      const from = Date.parse(`${v.from_date}T00:00:00Z`);
      const to = Date.parse(`${v.to_date}T00:00:00Z`);
      return Number.isFinite(from) && Number.isFinite(to) && to - from <= 62 * 86_400_000;
    },
    { message: 'range too wide (max 62 days)', path: ['to_date'] },
  );

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  let slug: string | null = null;

  try {
    // The limiter needs the service client, so it is created first. Nothing is
    // read from the database before the limit is checked.
    const db = serviceClient();

    const limit = await checkRateLimit(req, db, 'get_slots');
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

    // The branch decides whether a staff choice is even offered. When it is
    // hidden, a staff_id in the request is ignored rather than honoured — the
    // same rule create_booking applies, so the two cannot disagree.
    const staffId = branch.settings.staffChoice === 'hidden' ? null : (input.staff_id ?? null);

    // doc §6.2: 'all_greyed' shows booked slots greyed out; 'only_available'
    // hides them. The branch's setting decides, not the caller.
    const includeBooked = branch.settings.slotDisplay === 'all_greyed';

    const { data, error } = await db.rpc('get_free_slots', {
      p_branch_id: branch.branchId,
      p_service_id: input.service_id,
      p_staff_id: staffId,
      p_from_date: input.from_date,
      p_to_date: input.to_date,
      // Never true from the public page: doc §6.2 forbids showing out-of-hours
      // or inside-notice slots to a customer. Phase 4's dashboard passes true.
      p_ignore_notice: false,
      p_include_booked: includeBooked,
    });

    if (error) throw error;

    const showStaff = branch.settings.staffChoice !== 'hidden';

    // Map explicitly rather than spreading the row: a future column added to
    // `free_slot` must not leak to the public page by default.
    const slots = (data ?? []).map((s: Record<string, unknown>) => ({
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      local_date: s.local_date,
      local_minute: s.local_minute,
      available: s.available,
      ...(showStaff ? { staff_id: s.staff_id } : {}),
    }));

    // Staff names, only when the customer may choose. One query for the ids
    // actually present, rather than the whole team.
    let staffNames: Record<string, string> = {};
    if (showStaff && slots.length > 0) {
      const ids = [...new Set(slots.map((s) => s.staff_id).filter(Boolean))] as string[];
      if (ids.length > 0) {
        const { data: staff, error: staffErr } = await db
          .from('staff_profiles')
          .select('id, display_name')
          .in('id', ids);
        if (staffErr) throw staffErr;
        staffNames = Object.fromEntries((staff ?? []).map((s) => [s.id, s.display_name]));
      }
    }

    return jsonOk(req, {
      timezone: branch.timezone,
      branch_name: branch.branchName,
      currency: branch.currency,
      // Bot protection: the booking form must send this back. It is HMAC-signed
      // and bound to this slug, so it proves WHEN the form was issued without
      // trusting anything the client says. See _shared/startToken.ts.
      start_token: await issueStartToken(input.slug),
      settings: {
        staff_choice: branch.settings.staffChoice,
        slot_display: branch.settings.slotDisplay,
        show_prices: branch.settings.showPrices,
        booking_window_days: branch.settings.bookingWindowDays,
      },
      slots: slots.map((s) => ({
        ...s,
        ...(showStaff && s.staff_id
          ? { staff_name: staffNames[s.staff_id as string] ?? null }
          : {}),
      })),
    });
  } catch (err) {
    logUnexpected('get_slots', slug, err);
    return jsonError(req, 'server_error');
  }
});
