import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import type { Json } from '@/lib/supabase/database.types';

import type { BranchBookable } from '../bookingWarnings';

export const bookingSettingsKeys = createQueryKeys('booking-settings');
export const branchBookableKeys = createQueryKeys('branch-bookable');

export type StaffChoiceMode = 'hidden' | 'optional' | 'required';
export type SlotDisplayMode = 'only_available' | 'all_greyed';
export type ConfirmationMode = 'auto' | 'manual';
export type SlotIntervalMode = 'min_15' | 'min_30' | 'min_60' | 'service_length';

/**
 * The settings, camelCased. The DB column names are snake_case and the RPC takes
 * snake_case keys, so the mapping lives in this file and nowhere else.
 */
export type BookingSettings = {
  onlineBookingEnabled: boolean;
  staffChoice: StaffChoiceMode;
  slotDisplay: SlotDisplayMode;
  confirmation: ConfirmationMode;
  showPrices: boolean;
  requireClientEmail: boolean;
  slotInterval: SlotIntervalMode;
  bufferMinutes: number;
  minimumNoticeMinutes: number;
  bookingWindowDays: number;
  customerCanCancel: boolean;
  cancelCutoffHours: number;
  useResources: boolean;
  peoplePerSlot: number;
};

const SELECT =
  'online_booking_enabled, staff_choice, slot_display, confirmation, show_prices, require_client_email, slot_interval, buffer_minutes, minimum_notice_minutes, booking_window_days, customer_can_cancel, cancel_cutoff_hours, use_resources, people_per_slot';

/** One row per branch, created by a trigger, so this always exists for a live branch. */
export function useBookingSettings(
  businessId: string | null,
  branchId: string | null,
): UseQueryResult<BookingSettings, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: bookingSettingsKeys.detail({ businessId: businessId ?? 'none' }, branchId ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    // Settings change rarely and every booking screen reads them.
    staleTime: staleTimes.static,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('booking_settings')
        .select(SELECT)
        .eq('branch_id', branchId ?? '')
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return {
        onlineBookingEnabled: data.online_booking_enabled,
        staffChoice: data.staff_choice,
        slotDisplay: data.slot_display,
        confirmation: data.confirmation,
        showPrices: data.show_prices,
        requireClientEmail: data.require_client_email,
        slotInterval: data.slot_interval,
        bufferMinutes: data.buffer_minutes,
        minimumNoticeMinutes: data.minimum_notice_minutes,
        bookingWindowDays: data.booking_window_days,
        customerCanCancel: data.customer_can_cancel,
        cancelCutoffHours: data.cancel_cutoff_hours,
        useResources: data.use_resources,
        peoplePerSlot: data.people_per_slot,
      } satisfies BookingSettings;
    },
  });
}

/** Can this branch actually take an online booking, and if not, why not. */
export function useBranchBookable(
  businessId: string | null,
  branchId: string | null,
): UseQueryResult<BranchBookable, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: branchBookableKeys.detail({ businessId: businessId ?? 'none' }, branchId ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    // Shorter than the settings: this depends on hours, services and staff, any of
    // which the owner may have just changed on another screen.
    staleTime: staleTimes.list,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('branch_is_bookable', {
        p_branch_id: branchId ?? '',
      });

      if (error) throw error;

      // The RPC returns jsonb; the generated type is `Json`, so it is narrowed
      // here rather than asserted at every call site.
      const result = data as { bookable?: boolean; reasons?: string[] } | null;
      return {
        bookable: result?.bookable === true,
        reasons: (result?.reasons ?? []) as BranchBookable['reasons'],
      } satisfies BranchBookable;
    },
  });
}

/**
 * What `save_booking_settings` can refuse with. The screen maps each to a
 * message; `people_per_slot_conflict` carries the detail needed to explain it.
 */
export type SaveSettingsFailure =
  | { code: 'forbidden' | 'unknown_branch' | 'invalid_value'; field?: string }
  | {
      code: 'people_per_slot_conflict';
      conflict: {
        localDate: string;
        localMinute: number;
        booked: number;
        newLimit: number;
        serviceName: string | null;
        staffName: string | null;
        conflictingSlots: number;
      };
    };

export class SaveSettingsError extends Error {
  readonly failure: SaveSettingsFailure;

  constructor(failure: SaveSettingsFailure) {
    super(failure.code);
    this.name = 'SaveSettingsError';
    this.failure = failure;
  }
}

/**
 * The snake_case payload the RPC takes. Only the keys present are changed.
 *
 * Typed as the generated `Json` object shape rather than `Record<string, unknown>`
 * so it satisfies the RPC's parameter type without a cast — every value here is a
 * boolean, a number or a string enum, all of which are valid `Json`.
 */
function toRpcPayload(patch: Partial<BookingSettings>): { [key: string]: Json } {
  const out: { [key: string]: Json } = {};
  if (patch.onlineBookingEnabled !== undefined)
    out.online_booking_enabled = patch.onlineBookingEnabled;
  if (patch.staffChoice !== undefined) out.staff_choice = patch.staffChoice;
  if (patch.slotDisplay !== undefined) out.slot_display = patch.slotDisplay;
  if (patch.confirmation !== undefined) out.confirmation = patch.confirmation;
  if (patch.showPrices !== undefined) out.show_prices = patch.showPrices;
  if (patch.requireClientEmail !== undefined) out.require_client_email = patch.requireClientEmail;
  if (patch.slotInterval !== undefined) out.slot_interval = patch.slotInterval;
  if (patch.bufferMinutes !== undefined) out.buffer_minutes = patch.bufferMinutes;
  if (patch.minimumNoticeMinutes !== undefined)
    out.minimum_notice_minutes = patch.minimumNoticeMinutes;
  if (patch.bookingWindowDays !== undefined) out.booking_window_days = patch.bookingWindowDays;
  if (patch.customerCanCancel !== undefined) out.customer_can_cancel = patch.customerCanCancel;
  if (patch.cancelCutoffHours !== undefined) out.cancel_cutoff_hours = patch.cancelCutoffHours;
  if (patch.useResources !== undefined) out.use_resources = patch.useResources;
  if (patch.peoplePerSlot !== undefined) out.people_per_slot = patch.peoplePerSlot;
  return out;
}

/**
 * Save through the RPC, never a direct UPDATE.
 *
 * The RPC is the only thing that knows the `people_per_slot` downgrade rule, and
 * it returns `{ok:false,code}` rather than raising — so a refusal arrives as
 * `data`, not `error`, and has to be turned into a thrown `SaveSettingsError`
 * for react-query to treat it as a failure.
 */
export function useSaveBookingSettings(
  businessId: string | null,
  branchId: string | null,
): UseMutationResult<void, Error, Partial<BookingSettings>> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch) => {
      if (!branchId) throw new Error('No branch selected');

      const { data, error } = await getSupabase().rpc('save_booking_settings', {
        p_branch_id: branchId,
        p_settings: toRpcPayload(patch),
      });

      if (error) throw error;

      const result = data as Record<string, unknown> | null;
      if (!result || result.ok !== true) {
        const code = String(result?.code ?? 'invalid_value');

        if (code === 'people_per_slot_conflict') {
          const c = (result?.conflict ?? {}) as Record<string, unknown>;
          throw new SaveSettingsError({
            code: 'people_per_slot_conflict',
            conflict: {
              localDate: String(c.local_date ?? ''),
              localMinute: Number(c.local_minute ?? 0),
              booked: Number(c.booked ?? 0),
              newLimit: Number(c.new_limit ?? 0),
              serviceName: c.service_name ? String(c.service_name) : null,
              staffName: c.staff_name ? String(c.staff_name) : null,
              conflictingSlots: Number(c.conflicting_slots ?? 1),
            },
          });
        }

        throw new SaveSettingsError({
          code: code as 'forbidden' | 'unknown_branch' | 'invalid_value',
          field: result?.field ? String(result.field) : undefined,
        });
      }
    },
    onSuccess: async () => {
      const scope = { businessId: businessId ?? 'none' };
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: bookingSettingsKeys.detail(scope, branchId ?? 'none'),
        }),
        // `online_booking_enabled` is one of the reasons branch_is_bookable()
        // returns, so saving settings can change the answer.
        queryClient.invalidateQueries({
          queryKey: branchBookableKeys.detail(scope, branchId ?? 'none'),
        }),
      ]);
    },
  });
}
