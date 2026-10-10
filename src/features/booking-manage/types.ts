/**
 * The shapes the guest manage page renders. Deliberately not the Edge
 * Function's raw snake_case response — mapped once, at the edge, same
 * decision as `booking-public/types.ts`.
 */

export type ManageBookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type ManageBookingView = {
  status: ManageBookingStatus;
  startsAt: string;
  endsAt: string;
  timezone: string;
  localDate: string;
  localMinute: number;
  serviceName: string;
  staffName: string | null;
  branchName: string;
  /** Null when the location has no address on file. */
  branchAddress: string | null;
  businessName: string;
  /** First name only — the server never sends more (CLAUDE.md §13). */
  clientFirstName: string;
  priceMinor: number | null;
  currency: string | null;
  canCancel: boolean;
  canReschedule: boolean;
  cancelCutoffHours: number;
};

/** Result of a successful reschedule. */
export type RescheduleResult = {
  status: ManageBookingStatus;
  startsAt: string;
  endsAt: string;
  timezone: string;
  localDate: string;
  localMinute: number;
  serviceName: string;
  staffName: string | null;
  /** True when the branch requires owner approval again after moving the time. */
  needsApproval: boolean;
};

/** One slot for the reschedule grid. No ids — the server resolves them from the token. */
export type ManageSlot = {
  startsAt: string;
  localMinute: number;
  available: true;
};

export type ManageSlotsResult = {
  timezone: string;
  slots: ManageSlot[];
};
