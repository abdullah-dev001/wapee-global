/**
 * POST /functions/v1/manage_booking
 *
 * The guest manage link: view, cancel and reschedule one booking, by token.
 *
 * WHY ONE FUNCTION FOR THREE ACTIONS
 * ----------------------------------
 * All three take the same token, share the same rate-limit keying, the same
 * "every token failure looks identical" rule, and the same response mapping.
 * Three separate functions would be three copies of that, and the copies would
 * drift. The action is a field, each with its own zod schema.
 *
 * Request
 *   { action: 'get',        token }
 *   { action: 'cancel',     token, reason? }
 *   { action: 'reschedule', token, starts_at, staff_id? }
 *   { action: 'get_slots',  token, from_date?, to_date? }
 *
 * Response
 *   { ok: true, data: {...} }  |  { ok: false, code }
 *
 * `get_slots` is for the reschedule screen: it resolves the token to the
 * appointment's OWN branch/service/staff server-side
 * (`get_booking_reschedule_slots`) rather than taking any id from the caller,
 * so a guest holding just a token never learns a branch, service or staff id
 * (booking-public-api.md: "a slot never carries a resource id"). It shares the
 * `get_booking` rate-limit bucket — reading availability for your own booking
 * is the same cost class as reading the booking itself.
 *
 * PRIVACY
 * -------
 * A guessed token must not become a data leak. The RPCs return the client's
 * FIRST NAME only — no full name, phone, email, or custom-field answer — and
 * this function maps responses field by field, so a column added to an RPC
 * later cannot reach the page by accident.
 *
 * Every token failure (unknown, expired, revoked, wrong appointment, already
 * cancelled) returns the same `invalid_token`, so the endpoint cannot be used as
 * an oracle for guessing tokens.
 *
 * NO START TOKEN HERE
 * -------------------
 * The honeypot and timing checks belong to the booking FORM. A guest arriving
 * from an email link has no form and no prior `get_slots` call, so requiring a
 * start token would break the feature. The protection here is the token itself
 * (256-bit, scoped, expiring) plus the per-IP limits.
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { checkRateLimit, type PublicEndpoint } from '../_shared/rateLimit.ts';

/** 64 hex characters, as issued. Checked here so a junk token costs no round trip. */
const tokenSchema = z
  .string()
  .trim()
  .min(32)
  .max(200)
  .regex(/^[0-9a-f]+$/, 'invalid token');

const GetSchema = z.object({ action: z.literal('get'), token: tokenSchema }).strict();

const CancelSchema = z
  .object({
    action: z.literal('cancel'),
    token: tokenSchema,
    reason: z.string().trim().max(500).nullish(),
  })
  .strict();

const RescheduleSchema = z
  .object({
    action: z.literal('reschedule'),
    token: tokenSchema,
    starts_at: z
      .string()
      .datetime({ offset: true })
      .refine((v) => Date.parse(v) > Date.now() - 60_000, { message: 'starts_at is in the past' }),
    staff_id: z.string().uuid().nullish(),
  })
  .strict();

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid date');

const GetSlotsSchema = z
  .object({
    action: z.literal('get_slots'),
    token: tokenSchema,
    from_date: localDateSchema.nullish(),
    to_date: localDateSchema.nullish(),
  })
  .strict();

const RequestSchema = z.discriminatedUnion('action', [
  GetSchema,
  CancelSchema,
  RescheduleSchema,
  GetSlotsSchema,
]);

/**
 * RPC code -> public code.
 *
 * Kept local rather than in `_shared/response.ts` because these are the manage
 * flow's own vocabulary. The mapping is explicit, and anything unrecognised
 * becomes `server_error` rather than being forwarded.
 */
function mapCode(rpcCode: string | null): Parameters<typeof jsonError>[1] {
  switch (rpcCode) {
    case 'invalid_token':
      return 'invalid_token';
    case 'cancel_window_passed':
      return 'cancel_window_passed';
    case 'cancel_not_allowed':
    case 'not_cancellable':
      return 'not_cancellable';
    case 'slot_unavailable':
    case 'slot_taken':
    case 'no_staff':
    case 'no_resource':
    case 'too_soon':
    case 'outside_window':
    case 'same_slot':
      return 'slot_unavailable';
    case 'not_bookable':
      return 'not_bookable';
    default:
      return 'server_error';
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  try {
    const db = serviceClient();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, 'bad_request');
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(req, 'bad_request');
    const input = parsed.data;

    // Each action has its own window, so reading your own booking repeatedly
    // (a guest refreshing the page) does not consume the much tighter budget
    // for cancelling or rescheduling.
    const endpoint: PublicEndpoint =
      input.action === 'get' || input.action === 'get_slots'
        ? 'get_booking'
        : input.action === 'cancel'
          ? 'cancel_booking'
          : 'reschedule_booking';

    const limit = await checkRateLimit(req, db, endpoint);
    if (!limit.allowed) {
      return jsonError(req, 'rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
    }

    if (input.action === 'get') {
      const { data, error } = await db.rpc('get_booking', { p_token: input.token });
      if (error) throw error;

      const r = data as Record<string, unknown> | null;
      if (!r || r.ok !== true) return jsonError(req, mapCode((r?.code as string) ?? null));

      return jsonOk(req, {
        status: r.status,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        timezone: r.timezone,
        local_date: r.local_date,
        local_minute: r.local_minute,
        service_name: r.service_name,
        staff_name: r.staff_name,
        branch_name: r.branch_name,
        branch_address: r.branch_address,
        business_name: r.business_name,
        // First name only — enough to personalise, not a PII leak.
        client_first_name: r.client_first_name,
        price_minor: r.price_minor,
        currency: r.currency,
        can_cancel: r.can_cancel,
        can_reschedule: r.can_reschedule,
        cancel_cutoff_hours: r.cancel_cutoff_hours,
      });
    }

    if (input.action === 'cancel') {
      const { data, error } = await db.rpc('cancel_booking', {
        p_token: input.token,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;

      const r = data as Record<string, unknown> | null;
      if (!r || r.ok !== true) return jsonError(req, mapCode((r?.code as string) ?? null));

      // PHASE 6 SEAM: a cancellation should email the business (and the
      // customer). Nothing is sent yet — Resend lands in Phase 6. The booking IS
      // cancelled regardless, so a missing notification never blocks the guest.
      return jsonOk(req, { status: r.status });
    }

    if (input.action === 'get_slots') {
      const { data, error } = await db.rpc('get_booking_reschedule_slots', {
        p_token: input.token,
        p_from_date: input.from_date ?? null,
        p_to_date: input.to_date ?? null,
      });
      if (error) throw error;

      const r = data as Record<string, unknown> | null;
      if (!r || r.ok !== true) return jsonError(req, mapCode((r?.code as string) ?? null));

      return jsonOk(req, { timezone: r.timezone, slots: r.slots });
    }

    // reschedule
    const { data, error } = await db.rpc('reschedule_booking', {
      p_token: input.token,
      p_starts_at: input.starts_at,
      p_staff_id: input.staff_id ?? null,
    });
    if (error) throw error;

    const r = data as Record<string, unknown> | null;
    if (!r || r.ok !== true) return jsonError(req, mapCode((r?.code as string) ?? null));

    // PHASE 6 SEAM: a reschedule should email both sides, and when
    // `needs_approval` is true the business needs to know it must approve again.
    return jsonOk(req, {
      status: r.status,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      timezone: r.timezone,
      local_date: r.local_date,
      local_minute: r.local_minute,
      service_name: r.service_name,
      staff_name: r.staff_name,
      // So the page can say "this needs the salon's confirmation again".
      needs_approval: r.needs_approval,
    });
  } catch (err) {
    // The slug is unknown here (the token identifies the booking), so null.
    logUnexpected('manage_booking', null, err);
    return jsonError(req, 'server_error');
  }
});
