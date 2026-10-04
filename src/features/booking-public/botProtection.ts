/**
 * Mirrors `supabase/functions/_shared/config.ts` `BOT_PROTECTION.honeypotField`.
 * Must match exactly, or the server never sees the field the UI is hiding.
 *
 * The field must be hidden with `position: absolute; left: -9999px`, NEVER
 * `display: none` or `type="hidden"` (better bots skip both), plus
 * `autoComplete="off"` and `tabIndex={-1}` so it is never reachable by keyboard
 * or a screen reader. See `HoneypotField` in `components/HoneypotField.tsx`.
 */
export const BOT_PROTECTION_HONEYPOT_FIELD = 'company_website';

/** The server's minimum seconds between get_slots and create_booking. */
export const MIN_FORM_SECONDS = 3;
