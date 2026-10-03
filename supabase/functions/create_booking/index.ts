/**
 * POST /functions/v1/create_booking
 *
 * The public booking write. Takes a business SLUG — never a business_id — and
 * delegates the whole transaction to the `create_booking` RPC.
 *
 * Request
 *   {
 *     slug: string,
 *     service_id: uuid,
 *     starts_at: ISO instant,       // from a slot get_slots returned
 *     branch_id?: uuid,
 *     staff_id?: uuid,              // omit for "Any staff"
 *     client: { name, phone, email?, notes? },
 *     answers?: [{ custom_field_id: uuid, value: string }]
 *   }
 *
 * Response
 *   { ok: true, data: { appointment_id, status, starts_at, ..., manage_token } }
 *   { ok: false, code, field_id? }
 *
 * WHY THIS FUNCTION IS THIN
 * -------------------------
 * Every rule — availability, buffer, notice, window, capacity, answer
 * validation, client matching — lives in the RPC, in one transaction. Doing any
 * of it here would mean two implementations that drift, and a window between
 * the check and the write. The function's jobs are: validate the request shape,
 * resolve the slug, generate the manage token, call the RPC, and decide what the
 * customer is allowed to be told.
 *
 * THE MANAGE TOKEN is generated HERE, with `crypto.getRandomValues`, and the RPC
 * stores only its sha256 hash. Generating it in the Edge Function means the raw
 * value exists in one response and is never written to the database or to a log.
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected, toPublicCode } from '../_shared/response.ts';
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
    service_id: z.string().uuid(),
    branch_id: z.string().uuid().nullish(),
    staff_id: z.string().uuid().nullish(),
    starts_at: z
      .string()
      .datetime({ offset: true })
      // A slot must be in the future. The RPC enforces the real minimum notice;
      // this only rejects nonsense before any work starts.
      .refine((v) => Date.parse(v) > Date.now() - 60_000, { message: 'starts_at is in the past' }),
    client: z
      .object({
        name: z.string().trim().min(1).max(160),
        // Deliberately permissive: `normalise_phone_e164` in the database is the
        // authority on the stored shape, and it understands national formats,
        // "00" prefixes and punctuation. Rejecting too eagerly here would turn a
        // valid local number into a dead end.
        phone: z.string().trim().min(5).max(32),
        email: z.string().trim().email().max(320).nullish(),
        notes: z.string().trim().max(2000).nullish(),
      })
      .strict(),
    answers: z
      .array(
        z
          .object({
            custom_field_id: z.string().uuid(),
            value: z.string().max(4000),
          })
          .strict(),
      )
      // The RPC rejects >100 too; this stops a huge body being parsed at all.
      .max(100)
      .optional()
      .default([]),
  })
  .strict();

/** 32 bytes of CSPRNG as hex: 256 bits, well above the 128-bit floor. */
function generateManageToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return jsonError(req, 'bad_request');

  let slug: string | null = null;

  try {
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

    // After parsing, so the per-phone cap can be keyed (step 7), but before any
    // database work.
    const limit = await checkRateLimit(req, 'create_booking', {
      slug: input.slug,
      phone: input.client.phone,
    });
    if (!limit.allowed) return jsonError(req, 'rate_limited');

    const db = serviceClient();

    const branch = await resolveBranch(db, input.slug, input.branch_id ?? null);
    if (!branch) return jsonError(req, 'not_bookable');

    // Same rule as get_slots: when the branch hides the staff choice, a supplied
    // staff_id is ignored, not honoured. The RPC applies this too; doing it here
    // as well means the request the RPC receives already matches what the page
    // was allowed to ask for.
    const staffId = branch.settings.staffChoice === 'hidden' ? null : (input.staff_id ?? null);

    const manageToken = generateManageToken();

    const { data, error } = await db.rpc('create_booking', {
      p_branch_id: branch.branchId,
      p_service_id: input.service_id,
      p_starts_at: input.starts_at,
      p_staff_id: staffId,
      p_client_name: input.client.name,
      p_client_phone: input.client.phone,
      p_client_email: input.client.email ?? null,
      p_client_notes: input.client.notes ?? null,
      p_answers: input.answers,
      p_manage_token: manageToken,
    });

    if (error) throw error;

    // The RPC returns {ok:false,code,field_id} for every expected failure and
    // never raises (a raise would roll back step 7's counter).
    const result = data as Record<string, unknown> | null;
    if (!result || result.ok !== true) {
      const rpcCode = typeof result?.code === 'string' ? result.code : null;
      const fieldId = typeof result?.field_id === 'string' ? result.field_id : null;
      // Logged so an operator can see WHICH internal code occurred, while the
      // customer sees only the mapped public reason.
      console.warn(JSON.stringify({ endpoint: 'create_booking', slug, rpc_code: rpcCode }));
      return jsonError(req, toPublicCode(rpcCode), { fieldId });
    }

    // Mapped explicitly, so a column added to the RPC's response later cannot
    // reach the public page without someone deciding it should.
    return jsonOk(
      req,
      {
        appointment_id: result.appointment_id,
        status: result.status,
        starts_at: result.starts_at,
        ends_at: result.ends_at,
        local_date: result.local_date,
        local_minute: result.local_minute,
        timezone: result.timezone,
        service_name: result.service_name,
        staff_name: result.staff_name,
        branch_name: result.branch_name,
        // Only when the branch shows prices (doc §6.2).
        ...(branch.settings.showPrices
          ? { price_minor: result.price_minor, currency: result.currency }
          : {}),
        // The raw token, returned exactly once. The database holds only its
        // hash, so this response is the only chance to put it in the link.
        manage_token: result.manage_token,
      },
      201,
    );
  } catch (err) {
    logUnexpected('create_booking', slug, err);
    return jsonError(req, 'server_error');
  }
});
