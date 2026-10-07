/**
 * The shapes the public booking components render.
 *
 * Deliberately NOT the database row types and NOT the Edge Function response
 * types. These components are presentational and are used twice:
 *
 *   1. the settings LIVE PREVIEW (step 4), fed from sample data, and
 *   2. the real public booking page (step 5), fed from `get_slots`.
 *
 * A shared view model is what lets the same component serve both without the
 * preview having to fake an API response, and without the public page leaking
 * database column names into JSX. The mapping from each source happens at the
 * edge, in one place per source.
 */

export type PublicService = {
  id: string;
  name: string;
  durationMinutes: number;
  /** Minor units. Null when the branch hides prices (doc §6.2 show_prices). */
  priceMinor: number | null;
  /** ISO 4217, from the BRANCH (decision 23). */
  currency: string;
  categoryName: string | null;
};

export type PublicStaff = {
  id: string;
  displayName: string;
};

/**
 * One slot. Mirrors the `free_slot` composite the engine returns, minus anything
 * a customer must not see (resource id, seat count).
 *
 * `available: false` only ever appears when the branch's slot_display is
 * `all_greyed` — the page greys it and never learns why it is taken.
 */
export type PublicSlot = {
  /** UTC instant, ISO. The only unambiguous identifier for a slot. */
  startsAt: string;
  /** Minutes from local midnight at the BRANCH, for the "09:30" label. */
  localMinute: number;
  available: boolean;
  /** Only present when the branch offers a staff choice. */
  staffId?: string | null;
  staffName?: string | null;
};

/** A custom form field, as the snapshot describes it. */
export type PublicFormField = {
  id: string;
  label: string;
  fieldType: 'short_text' | 'long_text' | 'dropdown' | 'yes_no' | 'number';
  helpText: string | null;
  isRequired: boolean;
  /** Dropdown choices, in display order. Null for every other type. */
  options: string[] | null;
};

/** The settings the public page needs in order to render itself. */
export type PublicBookingConfig = {
  staffChoice: 'hidden' | 'optional' | 'required';
  slotDisplay: 'only_available' | 'all_greyed';
  showPrices: boolean;
  requireClientEmail: boolean;
  /** 'auto' shows "Booked"; 'manual' shows "Request sent, awaiting confirmation". */
  confirmation: 'auto' | 'manual';
  timezone: string;
  bookingWindowDays: number;
};

/**
 * What `get_booking_page` returns: everything the page needs to bootstrap
 * itself for a slug, before any service is picked. See
 * `supabase/functions/get_booking_page/index.ts`.
 */
export type BookingPageData = {
  branch: {
    name: string;
    timezone: string;
    currency: string;
  };
  settings: PublicBookingConfig;
  services: PublicService[];
  staff: PublicStaff[];
  /** Which staff perform which service, for filtering step 2. */
  serviceStaff: { serviceId: string; staffId: string }[];
  fields: PublicFormFieldSnapshot[];
};

/** A form field as the published snapshot describes it, with service scoping. */
export type PublicFormFieldSnapshot = PublicFormField & {
  appliesToAllServices: boolean;
  serviceIds: string[];
};

/** The public reasons an Edge Function call can fail with (mirrors `_shared/response.ts`). */
export type PublicErrorCode =
  | 'bad_request'
  | 'not_bookable'
  | 'slot_unavailable'
  | 'invalid_answer'
  | 'missing_answer'
  | 'invalid_phone'
  | 'invalid_name'
  | 'rate_limited'
  | 'too_fast'
  | 'email_required'
  | 'server_error'
  | 'network_error'
  // --- the guest manage link (manage_booking) ---
  /** Unknown, expired, revoked or replayed token — ONE code for all of them. */
  | 'invalid_token'
  /** Past the "customer can cancel" window (doc §6.2). */
  | 'cancel_window_passed'
  /** Already cancelled/completed/no-show, or cancel is switched off for this branch. */
  | 'not_cancellable'
  // --- the website, review page and widget ---
  /** Nothing public lives here (unknown, unpublished, inactive, widget not allowed). */
  | 'not_found'
  // --- the form signing page (sign_form) ---
  | 'signature_required'
  | 'invalid_signature';

export class PublicApiError extends Error {
  code: PublicErrorCode;
  fieldId?: string | null;
  retryAfterSeconds?: number;

  constructor(
    code: PublicErrorCode,
    opts?: { fieldId?: string | null; retryAfterSeconds?: number },
  ) {
    super(code);
    this.name = 'PublicApiError';
    this.code = code;
    this.fieldId = opts?.fieldId ?? null;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
  }
}

/** What `create_booking` returns on success. */
export type CreateBookingResult = {
  appointmentId: string;
  status: 'pending' | 'confirmed';
  startsAt: string;
  endsAt: string;
  localDate: string;
  localMinute: number;
  timezone: string;
  serviceName: string;
  staffName: string | null;
  branchName: string;
  priceMinor: number | null;
  currency: string | null;
  /** Raw token, present exactly once. Never persisted anywhere but memory/URL. */
  manageToken: string;
};

/** One slot grid "page": a day's worth of slots plus the token to book with. */
export type SlotsResult = {
  timezone: string;
  branchName: string;
  currency: string;
  startToken: string;
  slots: PublicSlot[];
};
