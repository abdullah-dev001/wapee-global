/**
 * POST /functions/v1/portal   (PUBLIC: verify_jwt = false; a customer has no Supabase account)
 *
 * The CLIENT PORTAL (add-on `client_portal`). Customers sign in with a single-use emailed link and get a
 * SESSION TOKEN scoped to one business. There is no auth.users row and no JWT: this function is the only
 * door, and every action calls a service_role RPC that re-resolves the session (generic `invalid_session`
 * for unknown / expired / revoked / add-on off / business inactive / nobody linked any more).
 *
 *   no session:  { action: 'info', slug }
 *                { action: 'request_login', slug, email, company_website? (honeypot) }   always ok for a valid email
 *                { action: 'exchange', token }                                           -> { session_token, ... }
 *   session:     { session, action: 'overview' | 'bookings' | 'packages' | 'invoices' | 'invoice' | 'photos' |
 *                  'photo_urls' | 'forms' | 'slots' | 'cancel' | 'reschedule' | 'book' | 'request_data' | 'sign_out', ... }
 *
 * Rate limits live in the database and fail closed: login requests 10/h per IP and 3/h per EMAIL; exchange
 * 30/h; reads 1200/h; writes 60/h. The raw IP is never stored (sha256 with a secret salt).
 * Responses are mapped field by field; internal notes, other clients, staff contact data never reach here.
 */

import { z } from 'npm:zod@3';
import { handlePreflight } from '../_shared/cors.ts';
import { jsonError, jsonOk, logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { checkRateLimit, clientIp, type PublicEndpoint } from '../_shared/rateLimit.ts';
import { hashWithSalt } from '../_shared/crypto.ts';
import { honeypotTripped } from '../_shared/startToken.ts';

const uuid = z.string().uuid();
const session = z
  .string()
  .min(32)
  .max(200)
  .regex(/^[0-9a-f]+$/);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Info = z.object({ action: z.literal('info'), slug: z.string().max(80) }).strict();
const RequestLogin = z
  .object({
    action: z.literal('request_login'),
    slug: z.string().max(80),
    email: z.string().max(254),
    company_website: z.string().max(200).nullish(),
  })
  .strict();
const Exchange = z
  .object({
    action: z.literal('exchange'),
    token: z
      .string()
      .min(32)
      .max(200)
      .regex(/^[0-9a-f]+$/),
  })
  .strict();

const S = { session };
const Overview = z.object({ ...S, action: z.literal('overview') }).strict();
const Bookings = z
  .object({
    ...S,
    action: z.literal('bookings'),
    scope: z.enum(['upcoming', 'past']),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10000).optional(),
  })
  .strict();
const Packages = z.object({ ...S, action: z.literal('packages') }).strict();
const Invoices = z
  .object({
    ...S,
    action: z.literal('invoices'),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(10000).optional(),
  })
  .strict();
const Invoice = z.object({ ...S, action: z.literal('invoice'), id: uuid }).strict();
const Photos = z.object({ ...S, action: z.literal('photos') }).strict();
const PhotoUrls = z
  .object({ ...S, action: z.literal('photo_urls'), file_ids: z.array(uuid).min(1).max(50) })
  .strict();
const Forms = z.object({ ...S, action: z.literal('forms') }).strict();
const Slots = z
  .object({
    ...S,
    action: z.literal('slots'),
    appointment_id: uuid,
    from_date: dateStr.nullish(),
    to_date: dateStr.nullish(),
  })
  .strict();
const Cancel = z
  .object({
    ...S,
    action: z.literal('cancel'),
    appointment_id: uuid,
    reason: z.string().trim().max(500).nullish(),
  })
  .strict();
const Reschedule = z
  .object({
    ...S,
    action: z.literal('reschedule'),
    appointment_id: uuid,
    starts_at: z.string().datetime({ offset: true }),
    staff_id: uuid.nullish(),
  })
  .strict();
const Book = z
  .object({
    ...S,
    action: z.literal('book'),
    client_id: uuid,
    service_id: uuid,
    starts_at: z.string().datetime({ offset: true }),
    staff_id: uuid.nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .strict();
const SignOut = z
  .object({ ...S, action: z.literal('sign_out'), all: z.boolean().optional() })
  .strict();

const RequestData = z
  .object({ ...S, action: z.literal('request_data'), kind: z.enum(['export', 'erase']) })
  .strict();

const RequestSchema = z.discriminatedUnion('action', [
  Info,
  RequestLogin,
  Exchange,
  Overview,
  Bookings,
  Packages,
  Invoices,
  Invoice,
  Photos,
  PhotoUrls,
  Forms,
  Slots,
  Cancel,
  Reschedule,
  Book,
  SignOut,
  RequestData,
]);

const READS = new Set([
  'overview',
  'bookings',
  'packages',
  'invoices',
  'invoice',
  'photos',
  'photo_urls',
  'forms',
  'slots',
  'sign_out',
]);

/** RPC code -> public code (an unknown code is never forwarded). */
function mapCode(code: string | null | undefined): Parameters<typeof jsonError>[1] {
  switch (code) {
    case 'invalid_session':
      return 'invalid_session';
    case 'rate_limited':
      return 'rate_limited';
    case 'invalid_token':
      return 'invalid_token';
    case 'not_found':
      return 'not_found';
    case 'not_available':
      return 'not_found';
    case 'bad_request':
    case 'invalid_email':
      return 'bad_request';
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
    case 'staff_unavailable':
      return 'slot_unavailable';
    case 'not_bookable':
    case 'booking_disabled':
    case 'unknown_service':
    case 'service_unavailable':
      return 'not_bookable';
    case 'needs_details':
      return 'needs_details';
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
    const action =
      body && typeof body === 'object' ? String((body as { action?: unknown }).action ?? '') : '';
    const endpoint: PublicEndpoint =
      action === 'info'
        ? 'portal_info'
        : action === 'request_login'
          ? 'portal_request_login'
          : action === 'exchange'
            ? 'portal_exchange'
            : action === 'request_data'
              ? 'portal_data_request'
              : READS.has(action)
                ? 'portal_read'
                : 'portal_write';

    const emailForKey =
      action === 'request_login' && body && typeof body === 'object'
        ? String((body as { email?: unknown }).email ?? '')
        : null;
    const limit = await checkRateLimit(req, db, endpoint, { key: emailForKey });
    if (!limit.allowed)
      return jsonError(req, 'rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });

    if (body && typeof body === 'object' && honeypotTripped(body as Record<string, unknown>)) {
      return jsonError(req, 'bad_request'); // generic: no tuning hint
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(req, 'bad_request');
    const input = parsed.data;
    const ip = clientIp(req);
    const ipHash = ip ? await hashWithSalt(ip) : null;

    const call = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(fn, args);
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
    };
    const fail = (r: Record<string, unknown>) =>
      jsonError(req, mapCode(typeof r.code === 'string' ? r.code : null));

    switch (input.action) {
      case 'info': {
        const r = await call('portal_info', { p_slug: input.slug });
        return r.ok === true ? jsonOk(req, { business_name: r.business_name }) : fail(r);
      }
      case 'request_login': {
        const r = await call('portal_request_login', {
          p_slug: input.slug,
          p_email: input.email,
          p_ip_hash: ipHash,
        });
        // ONE answer whatever happened: the page says "if that email is registered, a link is on its way".
        return r.ok === true ? jsonOk(req, { sent: true }) : fail(r);
      }
      case 'exchange': {
        const r = await call('portal_exchange_token', { p_token: input.token, p_ip_hash: ipHash });
        return r.ok === true
          ? jsonOk(req, {
              session_token: r.session_token,
              expires_at: r.expires_at,
              business_name: r.business_name,
              slug: r.slug,
            })
          : fail(r);
      }
      case 'overview': {
        const r = await call('portal_overview', { p_session: input.session });
        return r.ok === true
          ? jsonOk(req, {
              business_name: r.business_name,
              slug: r.slug,
              clients: r.clients,
              features: r.features,
            })
          : fail(r);
      }
      case 'bookings': {
        const r = await call('portal_bookings', {
          p_session: input.session,
          p_scope: input.scope,
          p_limit: input.limit ?? 20,
          p_offset: input.offset ?? 0,
        });
        return r.ok === true ? jsonOk(req, { rows: r.rows, has_more: r.has_more }) : fail(r);
      }
      case 'packages': {
        const r = await call('portal_packages', { p_session: input.session });
        return r.ok === true ? jsonOk(req, { available: r.available, rows: r.rows }) : fail(r);
      }
      case 'invoices': {
        const r = await call('portal_invoices', {
          p_session: input.session,
          p_limit: input.limit ?? 20,
          p_offset: input.offset ?? 0,
        });
        return r.ok === true ? jsonOk(req, { rows: r.rows, has_more: r.has_more }) : fail(r);
      }
      case 'invoice': {
        const r = await call('portal_invoice', {
          p_session: input.session,
          p_invoice_id: input.id,
        });
        return r.ok === true
          ? jsonOk(req, {
              invoice: r.invoice,
              items: r.items,
              payments: r.payments,
              credit_notes: r.credit_notes,
              branch: r.branch,
              business: r.business,
            })
          : fail(r);
      }
      case 'photos': {
        const r = await call('portal_photos', { p_session: input.session });
        return r.ok === true ? jsonOk(req, { available: r.available, rows: r.rows }) : fail(r);
      }
      case 'photo_urls': {
        const { data, error } = await db.rpc('portal_photo_paths', {
          p_session: input.session,
          p_file_ids: input.file_ids,
        });
        if (error) throw error;
        const rows = (data ?? []) as { file_id: string; path: string }[];
        if (rows.length === 0) return jsonOk(req, { urls: [] });
        const signed = await db.storage.from('client-files').createSignedUrls(
          rows.map((x) => x.path),
          300,
        );
        if (signed.error || !signed.data) throw signed.error ?? new Error('no signed urls');
        const byPath = new Map(signed.data.map((s) => [s.path, s.signedUrl]));
        return jsonOk(req, {
          urls: rows
            .map((x) => ({ file_id: x.file_id, url: byPath.get(x.path) ?? null }))
            .filter((u) => u.url),
        });
      }
      case 'forms': {
        const r = await call('portal_forms', { p_session: input.session });
        return r.ok === true ? jsonOk(req, { available: r.available, rows: r.rows }) : fail(r);
      }
      case 'slots': {
        const r = await call('portal_reschedule_slots', {
          p_session: input.session,
          p_appointment_id: input.appointment_id,
          p_from: input.from_date ?? null,
          p_to: input.to_date ?? null,
        });
        // Mapped like manage_booking's get_slots: slots + the booking's timezone, nothing else.
        return r.ok === true ? jsonOk(req, { slots: r.slots, timezone: r.timezone }) : fail(r);
      }
      case 'cancel': {
        const r = await call('portal_cancel_booking', {
          p_session: input.session,
          p_appointment_id: input.appointment_id,
          p_reason: input.reason ?? null,
        });
        return r.ok === true ? jsonOk(req, { cancelled: true }) : fail(r);
      }
      case 'reschedule': {
        const r = await call('portal_reschedule_booking', {
          p_session: input.session,
          p_appointment_id: input.appointment_id,
          p_starts_at: input.starts_at,
          p_staff_id: input.staff_id ?? null,
        });
        return r.ok === true
          ? jsonOk(req, { starts_at: r.starts_at, ends_at: r.ends_at })
          : fail(r);
      }
      case 'book': {
        const r = await call('portal_create_booking', {
          p_session: input.session,
          p_client_id: input.client_id,
          p_service_id: input.service_id,
          p_starts_at: input.starts_at,
          p_staff_id: input.staff_id ?? null,
          p_notes: input.notes ?? null,
        });
        return r.ok === true
          ? jsonOk(req, {
              appointment_id: r.appointment_id,
              status: r.status,
              starts_at: r.starts_at,
              ends_at: r.ends_at,
              service_name: r.service_name,
            })
          : fail(r);
      }
      case 'request_data': {
        // A REQUEST only: staff with clients.export / clients.erase act on it from the dashboard.
        const r = await call('portal_create_data_request', {
          p_session: input.session,
          p_kind: input.kind,
        });
        return r.ok === true
          ? jsonOk(req, { requested: true, duplicate: r.duplicate === true })
          : fail(r);
      }
      case 'sign_out': {
        await call('portal_sign_out', { p_session: input.session, p_all: input.all ?? false });
        return jsonOk(req, { signed_out: true });
      }
    }
  } catch (err) {
    logUnexpected('portal', null, err);
    return jsonError(req, 'server_error');
  }
});
