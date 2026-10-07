/**
 * Thin wrapper around the four public Edge Functions the booking page is
 * allowed to call. No direct table access, no authenticated client, no service
 * role — only `supabase.functions.invoke`, which uses the publishable key
 * already configured on the shared client (CLAUDE.md §6, booking-public-api.md).
 *
 * Every call returns the function's `data` on success or throws
 * `PublicApiError` with the server's code, so callers can switch on
 * `error.code` instead of parsing HTTP status themselves.
 */
import { getSupabase } from '@/lib/supabase';

import { PublicApiError, type PublicErrorCode } from '../types';

type FunctionName =
  | 'get_booking_page'
  | 'get_slots'
  | 'create_booking'
  | 'manage_booking'
  | 'get_website'
  | 'get_review_request'
  | 'submit_review'
  | 'validate_widget'
  | 'sign_form'
  | 'portal';

type FailureBody = { ok: false; code?: string; field_id?: string };
type SuccessBody<T> = { ok: true; data: T };

/**
 * `supabase-js` resolves `functions.invoke` even for a non-2xx response (it
 * puts the error on `.error`), but it does not give us the parsed JSON body in
 * every version/platform reliably, so we re-fetch the context by reading
 * `error.context` when present, falling back to a generic code.
 */
export async function callPublicFunction<T>(
  name: FunctionName,
  body: Record<string, unknown>,
): Promise<T> {
  const supabase = getSupabase();

  let response: { data: unknown; error: unknown };
  try {
    response = await supabase.functions.invoke(name, { body });
  } catch {
    throw new PublicApiError('network_error');
  }

  if (response.error) {
    const context = (response.error as { context?: Response }).context;
    if (context) {
      let parsed: FailureBody | null = null;
      try {
        parsed = (await context.clone().json()) as FailureBody;
      } catch {
        parsed = null;
      }
      const retryAfterHeader = context.headers?.get?.('Retry-After');
      const code = toKnownCode(parsed?.code);
      throw new PublicApiError(code, {
        fieldId: parsed?.field_id ?? null,
        retryAfterSeconds: retryAfterHeader ? Number(retryAfterHeader) : undefined,
      });
    }
    throw new PublicApiError('network_error');
  }

  const data = response.data as SuccessBody<T> | FailureBody;
  if (!data || data.ok !== true) {
    throw new PublicApiError(toKnownCode((data as FailureBody)?.code), {
      fieldId: (data as FailureBody)?.field_id ?? null,
    });
  }

  return data.data;
}

const KNOWN_CODES: readonly PublicErrorCode[] = [
  'bad_request',
  'not_bookable',
  'slot_unavailable',
  'invalid_answer',
  'missing_answer',
  'invalid_phone',
  'invalid_name',
  'rate_limited',
  'too_fast',
  'email_required',
  'server_error',
  'invalid_token',
  'cancel_window_passed',
  'not_cancellable',
  'not_found',
  'signature_required',
  'invalid_signature',
  'invalid_session',
  'needs_details',
];

function toKnownCode(code: string | undefined): PublicErrorCode {
  return (KNOWN_CODES as readonly string[]).includes(code ?? '')
    ? (code as PublicErrorCode)
    : 'server_error';
}
