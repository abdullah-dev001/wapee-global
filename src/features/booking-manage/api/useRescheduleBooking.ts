import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { callPublicFunction } from '@/features/booking-public/api';

import type { RescheduleResult } from '../types';

export type RescheduleBookingInput = {
  token: string;
  startsAt: string;
};

type RawResponse = {
  status: RescheduleResult['status'];
  starts_at: string;
  ends_at: string;
  timezone: string;
  local_date: string;
  local_minute: number;
  service_name: string;
  staff_name: string | null;
  needs_approval: boolean;
};

/**
 * Guest reschedule via `manage_booking`. Same staff member as the existing
 * booking — this feature does not let the guest also change who they see
 * (not asked for; `reschedule_booking` itself falls back to "any staff" only
 * if the original staff member can no longer do it).
 *
 * No retry: a double-submit must never silently reschedule twice.
 */
export function useRescheduleBooking(): UseMutationResult<
  RescheduleResult,
  Error,
  RescheduleBookingInput
> {
  return useMutation({
    retry: false,
    mutationFn: async (input) => {
      const raw = await callPublicFunction<RawResponse>('manage_booking', {
        action: 'reschedule',
        token: input.token,
        starts_at: input.startsAt,
      });

      return {
        status: raw.status,
        startsAt: raw.starts_at,
        endsAt: raw.ends_at,
        timezone: raw.timezone,
        localDate: raw.local_date,
        localMinute: raw.local_minute,
        serviceName: raw.service_name,
        staffName: raw.staff_name,
        needsApproval: raw.needs_approval,
      } satisfies RescheduleResult;
    },
  });
}
