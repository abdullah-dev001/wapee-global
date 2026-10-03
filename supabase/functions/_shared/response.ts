/**
 * One response shape for every public endpoint, and one place that decides what
 * a failure is allowed to say.
 *
 * Two rules the public endpoints must never break:
 *
 * 1. **A failure reveals nothing a stranger did not already know.** Whether a
 *    slug exists, whether a phone number is already a client, whether a
 *    business's trial has lapsed — none of that may be inferable from an error.
 *    So the RPC's machine codes are mapped to a SMALL set of public reasons
 *    here, and anything unrecognised becomes a generic failure.
 *
 * 2. **The client never sees a database string.** Codes go over the wire; the
 *    app translates them (i18n, CLAUDE.md §8). A Postgres message would be
 *    untranslatable, would leak schema detail, and would be unusable on a
 *    customer-facing page.
 */

import { corsHeaders } from './cors.ts';

/** Reasons the public page is allowed to be told about. */
export type PublicErrorCode =
  // the request itself was malformed
  | 'bad_request'
  // this business/branch cannot take online bookings right now. Deliberately
  // covers "no such slug", "trial expired", "booking switched off" and
  // "branch not bookable" so none of them can be told apart.
  | 'not_bookable'
  // the chosen slot is gone or was never offered
  | 'slot_unavailable'
  // a form answer is wrong; `field_id` says which
  | 'invalid_answer'
  // a required answer is missing; `field_id` says which
  | 'missing_answer'
  // the phone number could not be understood
  | 'invalid_phone'
  // the name was empty
  | 'invalid_name'
  // too many requests (step 7)
  | 'rate_limited'
  // something broke on our side
  | 'server_error';

/**
 * RPC code -> public reason.
 *
 * Several distinct internal codes collapse into `not_bookable` on purpose: a
 * stranger probing slugs must not be able to tell "no such business" from
 * "trial expired" from "booking disabled".
 */
const CODE_MAP: Record<string, PublicErrorCode> = {
  business_inactive: 'not_bookable',
  booking_disabled: 'not_bookable',
  unknown_service: 'not_bookable',
  service_unavailable: 'not_bookable',
  no_staff: 'slot_unavailable',
  staff_unavailable: 'slot_unavailable',
  no_resource: 'slot_unavailable',
  slot_unavailable: 'slot_unavailable',
  slot_taken: 'slot_unavailable',
  outside_window: 'slot_unavailable',
  too_soon: 'slot_unavailable',
  invalid_phone: 'invalid_phone',
  invalid_name: 'invalid_name',
  missing_answer: 'missing_answer',
  invalid_answer: 'invalid_answer',
  unknown_field: 'invalid_answer',
  too_many_answers: 'bad_request',
};

export function toPublicCode(rpcCode: string | null | undefined): PublicErrorCode {
  if (!rpcCode) return 'server_error';
  // An unmapped code is a code we have not thought about. Fail generically
  // rather than forwarding something that might describe our internals.
  return CODE_MAP[rpcCode] ?? 'server_error';
}

/** HTTP status for a public reason. */
function statusFor(code: PublicErrorCode): number {
  switch (code) {
    case 'bad_request':
    case 'invalid_answer':
    case 'missing_answer':
    case 'invalid_phone':
    case 'invalid_name':
      return 400;
    case 'not_bookable':
      // 404, not 403: "there is nothing bookable here" without confirming that
      // a business exists behind the slug.
      return 404;
    case 'slot_unavailable':
      // 409: the request was well-formed but the world moved. The page should
      // refresh the slots and let the customer pick again.
      return 409;
    case 'rate_limited':
      return 429;
    case 'server_error':
      return 500;
  }
}

export function jsonOk(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}

export function jsonError(
  req: Request,
  code: PublicErrorCode,
  extra?: { fieldId?: string | null },
): Response {
  const body: Record<string, unknown> = { ok: false, code };
  if (extra?.fieldId) body.field_id = extra.fieldId;

  return new Response(JSON.stringify(body), {
    status: statusFor(code),
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}

/**
 * Log an unexpected failure server-side with enough context to debug, while the
 * customer gets only `server_error`.
 *
 * Never log the request body: it holds a name, a phone number and possibly
 * medical answers. Only the endpoint, the slug and the error.
 */
export function logUnexpected(endpoint: string, slug: string | null, err: unknown): void {
  console.error(
    JSON.stringify({
      endpoint,
      slug,
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    }),
  );
}
