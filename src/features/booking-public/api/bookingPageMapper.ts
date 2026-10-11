import type { BookingPageData } from '../types';

type RawBranch = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  code: string;
};

export type RawBookingPage = {
  needs_branch: boolean;
  branches: RawBranch[];
  branch: {
    id: string;
    name: string;
    address: string | null;
    timezone: string;
    currency: string;
    country_code?: string;
  } | null;
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
 * The `get_booking_page` response -> the page's view model. One place, pure, unit-tested.
 *
 * Two shapes come back: the picker (`needs_branch`, only the locations) and the full page for one
 * location. A response without the newer fields (an older deployment) is read as a single-location
 * page, never as a crash.
 */
export function mapBookingPage(raw: RawBookingPage): BookingPageData {
  const branches = (raw.branches ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    address: b.address ?? null,
    timezone: b.timezone,
    code: b.code,
  }));

  const rawBranch = raw.branch;
  if (raw.needs_branch === true || !rawBranch) {
    return { needsBranch: true, branches };
  }

  return {
    needsBranch: false,
    branches,
    branch: {
      id: rawBranch.id,
      name: rawBranch.name,
      address: rawBranch.address ?? null,
      timezone: rawBranch.timezone,
      currency: rawBranch.currency,
      countryCode: rawBranch.country_code,
    },
    settings: {
      staffChoice: raw.settings.staff_choice,
      slotDisplay: raw.settings.slot_display,
      showPrices: raw.settings.show_prices,
      requireClientEmail: raw.settings.require_client_email,
      confirmation: raw.settings.confirmation,
      timezone: rawBranch.timezone,
      bookingWindowDays: raw.settings.booking_window_days,
    },
    services: raw.services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.duration_minutes,
      priceMinor: s.price_minor ?? null,
      currency: rawBranch.currency,
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
}
