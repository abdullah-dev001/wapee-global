import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createQueryKeys, staleTimes } from '@/lib/query';

import { callPublicFunction } from './client';
import type { BookingPageData } from '../types';

export const bookingPageKeys = createQueryKeys('booking-public-page');

type RawResponse = {
  branch: { name: string; timezone: string; currency: string };
  settings: {
    staff_choice: 'hidden' | 'optional' | 'required';
    slot_display: 'only_available' | 'all_greyed';
    show_prices: boolean;
    booking_window_days: number;
    require_client_email: boolean;
    confirmation: 'auto' | 'manual';
  };
  services: {
    id: string;
    name: string;
    duration_minutes: number;
    category_name: string | null;
    price_minor?: number;
  }[];
  staff: { id: string; display_name: string }[];
  service_staff: { service_id: string; staff_id: string }[];
  fields: {
    id: string;
    label: string;
    field_type: 'short_text' | 'long_text' | 'dropdown' | 'yes_no' | 'number';
    help_text: string | null;
    is_required: boolean;
    applies_to_all_services: boolean;
    options: string[] | null;
    service_ids: string[];
  }[];
};

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
export function useBookingPage(slug: string | undefined): UseQueryResult<BookingPageData, Error> {
  return useQuery({
    queryKey: bookingPageKeys.detail({ businessId: slug ?? 'none' }, slug ?? 'none'),
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
      const raw = await callPublicFunction<RawResponse>('get_booking_page', { slug });

      const data: BookingPageData = {
        branch: raw.branch,
        settings: {
          staffChoice: raw.settings.staff_choice,
          slotDisplay: raw.settings.slot_display,
          showPrices: raw.settings.show_prices,
          requireClientEmail: raw.settings.require_client_email,
          confirmation: raw.settings.confirmation,
          timezone: raw.branch.timezone,
          bookingWindowDays: raw.settings.booking_window_days,
        },
        services: raw.services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.duration_minutes,
          priceMinor: s.price_minor ?? null,
          currency: raw.branch.currency,
          categoryName: s.category_name,
        })),
        staff: raw.staff.map((s) => ({ id: s.id, displayName: s.display_name })),
        serviceStaff: raw.service_staff.map((s) => ({
          serviceId: s.service_id,
          staffId: s.staff_id,
        })),
        fields: raw.fields.map((f) => ({
          id: f.id,
          label: f.label,
          fieldType: f.field_type,
          helpText: f.help_text,
          isRequired: f.is_required,
          options: f.options,
          appliesToAllServices: f.applies_to_all_services,
          serviceIds: f.service_ids,
        })),
      };

      return data;
    },
  });
}
