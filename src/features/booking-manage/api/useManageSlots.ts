import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { staleTimes } from '@/lib/query';
import { callPublicFunction } from '@/features/booking-public/api';

import type { ManageSlotsResult } from '../types';

type RawSlot = { starts_at: string; local_minute: number; available: true };
type RawResponse = { timezone: string; slots: RawSlot[] };

export type UseManageSlotsArgs = {
  token: string;
  fromDate: string;
  toDate: string;
};

/**
 * Slots for the guest reschedule screen, via `manage_booking`'s `get_slots`
 * action. The server resolves the token to the appointment's OWN
 * branch/service/staff internally (`get_booking_reschedule_slots`) — this
 * hook never sends and never receives a branch, service or staff id, same
 * privacy posture as the rest of the manage flow.
 */
export function useManageSlots(
  args: UseManageSlotsArgs | null,
): UseQueryResult<ManageSlotsResult, Error> {
  return useQuery({
    queryKey: ['booking-manage', args?.token ?? 'none', 'slots', args?.fromDate, args?.toDate],
    enabled: Boolean(args),
    staleTime: staleTimes.live,
    queryFn: async () => {
      if (!args) throw new Error('useManageSlots called with no args');

      const raw = await callPublicFunction<RawResponse>('manage_booking', {
        action: 'get_slots',
        token: args.token,
        from_date: args.fromDate,
        to_date: args.toDate,
      });

      return {
        timezone: raw.timezone,
        slots: raw.slots.map((s) => ({
          startsAt: s.starts_at,
          localMinute: s.local_minute,
          available: true as const,
        })),
      } satisfies ManageSlotsResult;
    },
  });
}
