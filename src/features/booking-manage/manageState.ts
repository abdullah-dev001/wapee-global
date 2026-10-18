import type { ManageBookingView } from './types';

/**
 * The view to show after the guest cancelled. Built from the booking already on
 * screen, NOT re-fetched: cancelling revokes the manage token, so a refetch
 * answers `invalid_token` and the guest would see "This link is not valid"
 * right after a successful cancel (QA F13). No action is offered any more.
 */
export function cancelledView(view: ManageBookingView): ManageBookingView {
  return { ...view, status: 'cancelled', canCancel: false, canReschedule: false };
}
