import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { callPublicFunction } from '@/features/booking-public/api';

export type CancelBookingInput = {
  token: string;
  reason?: string | null;
};

type RawResponse = { status: 'cancelled' };

/** Guest cancellation via `manage_booking`. No retry: a double-tap must not re-cancel into an error. */
export function useCancelBooking(): UseMutationResult<
  { status: 'cancelled' },
  Error,
  CancelBookingInput
> {
  return useMutation({
    retry: false,
    mutationFn: async (input) => {
      const raw = await callPublicFunction<RawResponse>('manage_booking', {
        action: 'cancel',
        token: input.token,
        reason: input.reason ?? undefined,
      });
      return { status: raw.status };
    },
  });
}
