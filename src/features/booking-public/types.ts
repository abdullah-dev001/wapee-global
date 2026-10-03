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
};
