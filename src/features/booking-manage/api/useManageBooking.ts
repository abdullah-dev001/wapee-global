import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { staleTimes } from '@/lib/query';
import { callPublicFunction } from '@/features/booking-public/api';

import type { ManageBookingView } from '../types';

/**
 * Not built with `createQueryKeys` (CLAUDE.md §6): that factory scopes every
 * key by `businessId`/`branchId`, and this page is anonymous — the token is
 * the only identity it has, by design (it never learns a business or branch
 * id). The token is itself the key.
 */
export const manageBookingKeys = {
  detail: (token: string) => ['booking-manage', token] as const,
};

type RawResponse = {
  status: ManageBookingView['status'];
  starts_at: string;
  ends_at: string;
  timezone: string;
  local_date: string;
  local_minute: number;
  service_name: string;
  staff_name: string | null;
  branch_name: string;
  branch_address: string | null;
  business_name: string;
  client_first_name: string;
  price_minor: number | null;
  currency: string | null;
  can_cancel: boolean;
  can_reschedule: boolean;
  cancel_cutoff_hours: number;
};

/**
 * The guest manage page's view of one booking, by token. `live` staleTime:
 * the status/cutoff can change the moment the business acts on it, and this
 * page is only ever looked at for a few minutes at a time.
 *
 * The token itself is the query key's identity on purpose — never the
 * appointment id, which this page never learns.
 */
export function useManageBooking(token: string | null): UseQueryResult<ManageBookingView, Error> {
  return useQuery({
    queryKey: manageBookingKeys.detail(token ?? 'none'),
    enabled: Boolean(token),
    staleTime: staleTimes.live,
    retry: false,
    queryFn: async () => {
      if (!token) throw new Error('useManageBooking called with no token');

      const raw = await callPublicFunction<RawResponse>('manage_booking', {
        action: 'get',
        token,
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
        branchName: raw.branch_name,
        branchAddress: raw.branch_address ?? null,
        businessName: raw.business_name,
        clientFirstName: raw.client_first_name,
        priceMinor: raw.price_minor,
        currency: raw.currency,
        canCancel: raw.can_cancel,
        canReschedule: raw.can_reschedule,
        cancelCutoffHours: raw.cancel_cutoff_hours,
      } satisfies ManageBookingView;
    },
  });
}
