/**
 * Maps a `PublicApiError` to what the UI should DO, as a pure function —
 * tested without a renderer (CLAUDE.md §10a).
 *
 * The session brief spells out a specific behaviour per code, and keeping the
 * mapping here (rather than inline in the screen) means the test can assert on
 * it directly instead of simulating a failed fetch through the whole flow.
 */
import type { PublicErrorCode } from './types';

export type ErrorAction =
  /** Show a calm message with the retry time; no automatic retry loop. */
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  /** Wait a beat and retry the SAME request once, automatically. */
  | { kind: 'retry_once' }
  /** The slot is gone: refresh the slot grid, keep the customer's form data. */
  | { kind: 'refresh_slots' }
  /** Highlight one field with a message; field_id says which. */
  | { kind: 'highlight_field'; fieldId: string | null; message: 'missing' | 'invalid' }
  /** A generic "not available" page that reveals nothing about why. */
  | { kind: 'not_available' }
  /** A network/server error: show a retry button. */
  | { kind: 'retry_button' }
  /** The manage link is unknown, expired, revoked or replayed — ALWAYS this generic page, no hints. */
  | { kind: 'invalid_link' }
  /** Cancel/reschedule window has passed, or the booking is already finished with. */
  | { kind: 'not_allowed' };

export function actionFor(
  code: PublicErrorCode,
  opts?: { retryAfterSeconds?: number; fieldId?: string | null },
): ErrorAction {
  switch (code) {
    case 'rate_limited':
      return { kind: 'rate_limited', retryAfterSeconds: opts?.retryAfterSeconds ?? 60 };
    case 'too_fast':
      // The page can recover from this one gracefully: wait a moment and
      // resubmit automatically with a freshly-fetched token.
      return { kind: 'retry_once' };
    case 'slot_unavailable':
      return { kind: 'refresh_slots' };
    case 'missing_answer':
      return { kind: 'highlight_field', fieldId: opts?.fieldId ?? null, message: 'missing' };
    case 'invalid_answer':
    case 'invalid_phone':
    case 'invalid_name':
    case 'email_required':
    case 'signature_required':
    case 'invalid_signature':
    case 'needs_details':
      return { kind: 'highlight_field', fieldId: opts?.fieldId ?? null, message: 'invalid' };
    case 'not_bookable':
    case 'not_found':
      return { kind: 'not_available' };
    case 'bad_request':
    case 'server_error':
    case 'network_error':
      return { kind: 'retry_button' };
    case 'invalid_token':
    case 'invalid_session':
      return { kind: 'invalid_link' };
    case 'cancel_window_passed':
    case 'not_cancellable':
      return { kind: 'not_allowed' };
  }
}
