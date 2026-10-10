import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createQueryKeys, staleTimes } from '@/lib/query';

import { callPublicFunction } from './client';
import { mapBookingPage, type RawBookingPage } from './bookingPageMapper';
import type { BookingPageData } from '../types';

export const bookingPageKeys = createQueryKeys('booking-public-page');

/**
 * Bootstraps the public booking page for a slug: branch info, settings,
 * services, staff and the published form — everything step 1 needs before a
 * service is chosen. Backed by the `get_booking_page` Edge Function
 * (service_role only on the DB side; the page never touches tables directly).
 *
 * `staleTime: static` because a business's catalogue does not change between
 * two page loads a few minutes apart, and a customer re-opening the tab after
 * stepping away should not wait on a second round trip.
 */
export function useBookingPage(
  slug: string | undefined,
  /** A branch id or short code (`?branch=`); null/undefined = let the server decide. */
  branchRef?: string | null,
): UseQueryResult<BookingPageData, Error> {
  return useQuery({
    queryKey: bookingPageKeys.detail(
      { businessId: slug ?? 'none' },
      `${slug ?? 'none'}:${branchRef ?? 'default'}`,
    ),
    enabled: Boolean(slug),
    staleTime: staleTimes.static,
    retry: (failureCount, error) => {
      // A 'not_bookable' slug will never succeed by retrying; a transient
      // network/server error might.
      const code = (error as { code?: string }).code;
      if (code === 'not_bookable' || code === 'bad_request') return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const raw = await callPublicFunction<RawBookingPage>('get_booking_page', {
        slug,
        ...(branchRef ? { branch: branchRef } : {}),
      });

      return mapBookingPage(raw);
    },
  });
}
