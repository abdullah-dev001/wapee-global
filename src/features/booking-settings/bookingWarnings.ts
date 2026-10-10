/**
 * The warning rules for the booking settings screen, as pure functions.
 *
 * Kept out of the components so they can be unit-tested without a renderer
 * (CLAUDE.md §10a asks for tests on pure logic), and so the same conditions can
 * be reused by the Phase 7 website block, which has to make the same "is this
 * branch actually bookable?" decision.
 */

/** The reason codes `branch_is_bookable()` returns. */
export type BookableReason =
  | 'booking_disabled'
  | 'no_branch_hours'
  | 'no_bookable_service'
  | 'no_bookable_staff'
  | 'no_staffed_service'
  | 'no_staff_hours';

export type BranchBookable = {
  bookable: boolean;
  // `readonly` because nothing here mutates it, and that lets a caller pass a
  // literal built with `as const`.
  reasons: readonly BookableReason[];
};

export type WarningSeverity = 'error' | 'warning' | 'info';

export type BookingWarning = {
  /** i18n key suffix under `booking.warning.*`. */
  code: BookableReason | 'buffer_override';
  severity: WarningSeverity;
  /** Where the owner should go to fix it, if anywhere. */
  fixRoute?: '/schedule' | '/services' | '/staff';
};

/**
 * Order matters: the FIRST thing the owner must fix comes first.
 *
 * The order is the real dependency chain, not alphabetical:
 *   1. hours — without them the engine returns nothing at all, whatever else is set
 *   2. a bookable service — nothing to book
 *   3. bookable staff — nobody to do it
 *   4. a staffed service — both exist but are not linked, which is the subtlest
 *      case and the one an owner is least likely to spot
 *   5. booking switched off — last, because it is deliberate, not an oversight
 */
const REASON_ORDER: BookableReason[] = [
  'no_branch_hours',
  'no_bookable_service',
  'no_bookable_staff',
  'no_staffed_service',
  'no_staff_hours',
  'booking_disabled',
];

export type BookingFixRoute = NonNullable<BookingWarning['fixRoute']>;

const FIX_ROUTES: Partial<Record<BookableReason, BookingWarning['fixRoute']>> = {
  no_branch_hours: '/schedule',
  no_bookable_service: '/services',
  no_bookable_staff: '/staff',
  // Both exist; the missing link is "which staff perform this service", which
  // lives on the service.
  no_staffed_service: '/services',
  // Hours are edited per person from the Team screen.
  no_staff_hours: '/staff',
};

/** Where the owner goes to fix one reason (also used by the Today setup checklist). */
export function fixRouteFor(reason: BookableReason): BookingFixRoute | undefined {
  return FIX_ROUTES[reason];
}

/**
 * `booking_disabled` is a choice the owner made, so it is an `info`, not a
 * problem. Everything else is setup that is missing, so it blocks bookings and
 * reads as an error.
 */
function severityFor(reason: BookableReason): WarningSeverity {
  return reason === 'booking_disabled' ? 'info' : 'error';
}

/**
 * Turn `branch_is_bookable()` into an ordered list of warnings to render.
 *
 * `serviceBufferMinutes` is the set of non-zero per-service buffers at this
 * branch. When any exist AND the branch has its own buffer, the two interact in a
 * way that surprises people, so an extra `buffer_override` warning is added —
 * see `bufferExplanationKey` for what it actually says.
 */
export function bookingWarnings(
  bookable: BranchBookable | null | undefined,
  options?: { branchBufferMinutes?: number; serviceBufferMinutes?: number[] },
): BookingWarning[] {
  const warnings: BookingWarning[] = [];

  const reasons = bookable?.reasons ?? [];
  for (const reason of REASON_ORDER) {
    if (reasons.includes(reason)) {
      warnings.push({
        code: reason,
        severity: severityFor(reason),
        fixRoute: FIX_ROUTES[reason],
      });
    }
  }

  const branchBuffer = options?.branchBufferMinutes ?? 0;
  const hasServiceBuffer = (options?.serviceBufferMinutes ?? []).some((m) => m > 0);

  // Only worth saying when BOTH are set: that is the only case where the owner's
  // intuition ("they add up") is wrong in a way that matters.
  if (branchBuffer > 0 && hasServiceBuffer) {
    warnings.push({ code: 'buffer_override', severity: 'warning' });
  }

  return warnings;
}

/**
 * Which explanation to show for the buffer, based on what is actually set.
 *
 * **This describes the engine's real behaviour, verified in the SQL:**
 *
 * ```sql
 * v_buffer := case when coalesce(v_service_buffer, 0) > 0
 *                  then v_service_buffer else v_branch_buffer end;
 * ```
 *
 * (`get_free_slots` and `create_booking` both do exactly this, and must agree or
 * a slot the engine offered would be refused at booking time.)
 *
 * So: **a service's own buffer REPLACES the branch buffer. They never add.** A
 * 10-minute branch buffer and a 15-minute service buffer give 15 minutes, not 25.
 * A service buffer of 0 means "no per-service setting", so the branch value is
 * used — which also means a service cannot opt OUT of the branch buffer by
 * setting 0.
 */
export function bufferExplanationKey(
  branchBufferMinutes: number,
  serviceBufferMinutes: number[],
): 'none' | 'branchOnly' | 'serviceOnly' | 'serviceOverridesBranch' {
  const hasServiceBuffer = serviceBufferMinutes.some((m) => m > 0);

  if (branchBufferMinutes <= 0 && !hasServiceBuffer) return 'none';
  if (branchBufferMinutes > 0 && !hasServiceBuffer) return 'branchOnly';
  if (branchBufferMinutes <= 0 && hasServiceBuffer) return 'serviceOnly';
  return 'serviceOverridesBranch';
}

/**
 * The public booking URL.
 *
 * One function so the settings screen, the Phase 7 website block and any share
 * sheet produce the same string. Without a `branchCode` it is the business's
 * main link: the page asks the customer to choose when there are two or more
 * bookable locations (and goes straight to the only one otherwise). With a
 * `branchCode` (the location's invoice prefix; a branch id works too) the page
 * opens already set to that location and skips the picker.
 */
export function bookingUrl(
  publicSiteUrl: string,
  businessSlug: string,
  branchCode?: string | null,
): string {
  const base = publicSiteUrl.replace(/\/+$/, '');
  const url = `${base}/${businessSlug}/book`;
  return branchCode ? `${url}?branch=${encodeURIComponent(branchCode)}` : url;
}

/**
 * Whether the booking link may be presented as live.
 *
 * The user's rule (2026-10-03): the link must not look active until the branch
 * really can take a booking. A link that loads a page offering nothing reads as
 * broken software rather than as unfinished setup.
 */
export function bookingLinkIsLive(bookable: BranchBookable | null | undefined): boolean {
  return bookable?.bookable === true;
}
