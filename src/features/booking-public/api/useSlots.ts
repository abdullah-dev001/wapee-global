import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createQueryKeys, staleTimes } from '@/lib/query';

import { callPublicFunction } from './client';
import type { PublicSlot, SlotsResult } from '../types';

export const slotsKeys = createQueryKeys('booking-public-slots');

type RawSlot = {
  starts_at: string;
  local_minute: number;
  available: boolean;
  staff_id?: string | null;
  staff_name?: string | null;
};

type RawResponse = {
  timezone: string;
  branch_name: string;
  currency: string;
  start_token: string;
  slots: RawSlot[];
};

export type UseSlotsArgs = {
  slug: string;
  /** The location being booked. Null = the server's default (the primary branch). */
  branchId?: string | null;
  serviceId: string;
  staffId?: string | null;
  fromDate: string;
  toDate: string;
};

/**
 * Free slots for a date range, via the `get_slots` Edge Function. Re-fetched
 * whenever the service, staff choice or date range changes, and treated as
 * `live` data (CLAUDE.md §6): availability can go stale the instant someone
 * else books, so this is never cached for long and the page must re-fetch
 * before trusting a slot it is about to book.
 *
 * Each response carries a fresh `start_token` (bot protection, booking-public-api.md)
 * — the caller must use the token from the MOST RECENT fetch, never a stale one.
 */
export function useSlots(args: UseSlotsArgs | null): UseQueryResult<SlotsResult, Error> {
  return useQuery({
    queryKey: slotsKeys.list({
      businessId: args?.slug ?? 'none',
      filters: {
        branchId: args?.branchId ?? null,
        serviceId: args?.serviceId,
        staffId: args?.staffId ?? null,
        fromDate: args?.fromDate,
        toDate: args?.toDate,
      },
    }),
    enabled: Boolean(args),
    staleTime: staleTimes.live,
    queryFn: async () => {
      if (!args) throw new Error('useSlots called with no args');

      const raw = await callPublicFunction<RawResponse>('get_slots', {
        slug: args.slug,
        ...(args.branchId ? { branch_id: args.branchId } : {}),
        service_id: args.serviceId,
        staff_id: args.staffId ?? undefined,
        from_date: args.fromDate,
        to_date: args.toDate,
      });

      const slots: PublicSlot[] = raw.slots.map((s) => ({
        startsAt: s.starts_at,
        localMinute: s.local_minute,
        available: s.available,
        staffId: s.staff_id ?? null,
        staffName: s.staff_name ?? null,
      }));

      return {
        timezone: raw.timezone,
        branchName: raw.branch_name,
        currency: raw.currency,
        startToken: raw.start_token,
        slots,
      } satisfies SlotsResult;
    },
  });
}
