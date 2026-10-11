import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { callPublicFunction } from '@/features/booking-public/api/client';
import { PublicApiError } from '@/features/booking-public/types';

import { clearSession, loadSession, saveSession } from '../portalSession';

const call = <T>(body: Record<string, unknown>) => callPublicFunction<T>('portal', body);

export type PortalFeatures = { packages: boolean; files: boolean; forms: boolean };
export type PortalClient = { id: string; first_name: string };
export type PortalOverview = {
  business_name: string;
  slug: string;
  clients: PortalClient[];
  features: PortalFeatures;
};

export type PortalBooking = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  service_name: string;
  staff_name: string | null;
  branch_name: string;
  price_minor: number | null;
  currency: string;
  client_notes: string | null;
  client_first_name: string;
  can_cancel: boolean;
  cancel_cutoff_hours: number | null;
};

export type PortalPackage = {
  id: string;
  name: string;
  sessions_purchased: number;
  sessions_bonus: number;
  used: number;
  remaining: number;
  sold_at: string;
  expires_at: string | null;
  is_expired: boolean;
  is_cancelled: boolean;
  history: { kind: 'deduct' | 'reversal'; at: string; service_name: string | null }[];
};

export type PortalInvoiceRow = {
  id: string;
  number: string;
  issued_at: string;
  currency: string;
  total_minor: number;
  payment_status: string | null;
  balance_minor: number;
};

export type PortalInvoice = {
  invoice: Record<string, unknown> & {
    number: string;
    currency: string;
    issued_at: string;
    total_minor: number;
  };
  items: {
    description: string;
    quantity: number;
    unit_price_minor: number;
    discount_minor: number;
    line_net_minor: number;
  }[];
  payments: {
    kind: 'payment' | 'reversal';
    method: string;
    amount_minor: number;
    paid_at: string;
  }[];
  credit_notes: { number: string; issued_at: string; total_minor: number }[];
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    timezone: string;
    currency: string;
  };
  business: { name: string };
};

/** The stored session token for this business page (null = signed out). */
export function usePortalSession(slug: string) {
  return useQuery({
    queryKey: ['portal', slug, 'session'],
    staleTime: Infinity,
    queryFn: () => loadSession(slug),
  });
}

export function usePortalInfo(slug: string) {
  return useQuery({
    queryKey: ['portal', slug, 'info'],
    staleTime: 5 * 60_000,
    retry: (count, error) =>
      !(error instanceof PublicApiError && error.code === 'not_found') && count < 2,
    queryFn: () => call<{ business_name: string }>({ action: 'info', slug }),
  });
}

/** Ask for a sign-in link. The reply is the same whether or not the email is registered. */
export function useRequestLogin(slug: string) {
  return useMutation({
    mutationFn: (input: { email: string; honeypot: string }) =>
      call<{ sent: boolean }>({
        action: 'request_login',
        slug,
        email: input.email,
        company_website: input.honeypot,
      }),
  });
}

/** Trade the one-time link for a session (runs once per link; the result is stored). */
export function useExchangeLink(slug: string, token: string | null | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['portal', slug, 'exchange', token ?? 'none'],
    enabled: Boolean(token),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const r = await call<{ session_token: string }>({ action: 'exchange', token });
      await saveSession(slug, r.session_token);
      queryClient.setQueryData(['portal', slug, 'session'], r.session_token);
      return true;
    },
  });
}

function usePortalQuery<T>(
  slug: string,
  session: string | null,
  name: string,
  extra: unknown[],
  body: Record<string, unknown>,
  enabled = true,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['portal', slug, name, ...extra],
    enabled: Boolean(session) && enabled,
    staleTime: 30_000,
    retry: (count, error) =>
      !(
        error instanceof PublicApiError &&
        (error.code === 'invalid_session' || error.code === 'not_found')
      ) && count < 2,
    queryFn: async () => {
      try {
        return await call<T>({ session, ...body });
      } catch (error) {
        if (error instanceof PublicApiError && error.code === 'invalid_session') {
          await clearSession(slug);
          queryClient.setQueryData(['portal', slug, 'session'], null);
        }
        throw error;
      }
    },
  });
}

export const usePortalOverview = (slug: string, session: string | null) =>
  usePortalQuery<PortalOverview>(slug, session, 'overview', [], { action: 'overview' });
export const usePortalBookings = (
  slug: string,
  session: string | null,
  scope: 'upcoming' | 'past',
) =>
  usePortalQuery<{ rows: PortalBooking[]; has_more: boolean }>(slug, session, 'bookings', [scope], {
    action: 'bookings',
    scope,
    limit: 50,
  });
export const usePortalPackages = (slug: string, session: string | null, enabled: boolean) =>
  usePortalQuery<{ available: boolean; rows: PortalPackage[] }>(
    slug,
    session,
    'packages',
    [],
    { action: 'packages' },
    enabled,
  );
export const usePortalInvoices = (slug: string, session: string | null) =>
  usePortalQuery<{ rows: PortalInvoiceRow[]; has_more: boolean }>(slug, session, 'invoices', [], {
    action: 'invoices',
    limit: 50,
  });
export const usePortalInvoice = (slug: string, session: string | null, id: string | null) =>
  usePortalQuery<PortalInvoice>(
    slug,
    session,
    'invoice',
    [id],
    { action: 'invoice', id },
    Boolean(id),
  );
export const usePortalPhotos = (slug: string, session: string | null, enabled: boolean) =>
  usePortalQuery<{
    available: boolean;
    rows: { id: string; category: string; created_at: string }[];
  }>(slug, session, 'photos', [], { action: 'photos' }, enabled);
export const usePortalForms = (slug: string, session: string | null, enabled: boolean) =>
  usePortalQuery<{
    available: boolean;
    rows: {
      id: string;
      title: string;
      kind: string;
      signed_at: string;
      signer_name: string;
      voided: boolean;
    }[];
  }>(slug, session, 'forms', [], { action: 'forms' }, enabled);

/** Signed photo URLs (5 minutes), refreshed before they expire. */
export function usePortalPhotoUrls(slug: string, session: string | null, ids: readonly string[]) {
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: ['portal', slug, 'photo-urls', ...sorted],
    enabled: Boolean(session) && sorted.length > 0,
    staleTime: 4 * 60_000,
    refetchInterval: 4 * 60_000,
    queryFn: async () => {
      const r = await call<{ urls: { file_id: string; url: string }[] }>({
        session,
        action: 'photo_urls',
        file_ids: sorted.slice(0, 50),
      });
      return Object.fromEntries(r.urls.map((u) => [u.file_id, u.url]));
    },
  });
}

export function usePortalSlots(
  slug: string,
  session: string | null,
  appointmentId: string | null,
  date: string,
) {
  return useQuery({
    queryKey: ['portal', slug, 'slots', appointmentId, date],
    enabled: Boolean(session && appointmentId),
    staleTime: 10_000,
    queryFn: async () => {
      const r = await call<{
        timezone: string;
        slots: { starts_at: string; local_minute: number }[];
      }>({
        session,
        action: 'slots',
        appointment_id: appointmentId,
        from_date: date,
        to_date: date,
      });
      return {
        timezone: r.timezone,
        slots: r.slots.map((s) => ({
          startsAt: s.starts_at,
          localMinute: s.local_minute,
          available: true,
        })),
      };
    },
  });
}

function useRefreshAfter(slug: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['portal', slug, 'bookings'] });
    void queryClient.invalidateQueries({ queryKey: ['portal', slug, 'slots'] });
  };
}

export function usePortalCancel(slug: string, session: string | null) {
  const refresh = useRefreshAfter(slug);
  return useMutation({
    mutationFn: (input: { appointmentId: string; reason?: string }) =>
      call({
        session,
        action: 'cancel',
        appointment_id: input.appointmentId,
        reason: input.reason ?? null,
      }),
    onSuccess: refresh,
  });
}

export function usePortalReschedule(slug: string, session: string | null) {
  const refresh = useRefreshAfter(slug);
  return useMutation({
    mutationFn: (input: { appointmentId: string; startsAt: string }) =>
      call({
        session,
        action: 'reschedule',
        appointment_id: input.appointmentId,
        starts_at: input.startsAt,
      }),
    onSuccess: refresh,
  });
}

export function usePortalBook(slug: string, session: string | null) {
  const refresh = useRefreshAfter(slug);
  return useMutation({
    mutationFn: (input: {
      clientId: string;
      serviceId: string;
      startsAt: string;
      staffId?: string | null;
      /** The location being booked; null = the primary one. */
      branchId?: string | null;
      notes?: string;
    }) =>
      call({
        session,
        action: 'book',
        client_id: input.clientId,
        service_id: input.serviceId,
        starts_at: input.startsAt,
        staff_id: input.staffId ?? null,
        branch_id: input.branchId ?? null,
        notes: input.notes ?? null,
      }),
    onSuccess: refresh,
  });
}

export function usePortalSignOut(slug: string, session: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (all: boolean) => {
      try {
        await call({ session, action: 'sign_out', all });
      } finally {
        await clearSession(slug);
        queryClient.removeQueries({ queryKey: ['portal', slug] });
        queryClient.setQueryData(['portal', slug, 'session'], null);
      }
    },
  });
}

/**
 * "Request my data" / "Request erasure": creates a REQUEST for the business to act on (it changes nothing about
 * the customer's data by itself). A second request of the same kind while one is open is accepted as a duplicate.
 */
export function usePortalRequestData(slug: string, session: string | null) {
  void slug;
  return useMutation({
    mutationFn: (kind: 'export' | 'erase') =>
      call<{ requested: boolean; duplicate: boolean }>({ session, action: 'request_data', kind }),
  });
}
