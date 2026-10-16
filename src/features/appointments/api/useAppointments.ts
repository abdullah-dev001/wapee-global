import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes, useLiveRefetchInterval } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { type UtcIso } from '@/lib/time';

import {
  type AppointmentErrorCode,
  type AppointmentRow,
  AppointmentRpcError,
  type AppointmentStatus,
  type BookingSource,
} from '../types';

export const appointmentKeys = createQueryKeys('appointments');

type RawAppointmentRow = {
  id: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: BookingSource | null;
  service_id: string;
  service_name: string;
  staff_id: string | null;
  staff_name: string | null;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  price_minor: number | null;
  invoice_id: string | null;
};

function mapRow(row: RawAppointmentRow): AppointmentRow {
  return {
    id: row.id,
    branchId: row.branch_id,
    startsAt: row.starts_at as UtcIso,
    endsAt: row.ends_at as UtcIso,
    status: row.status,
    source: row.source,
    serviceId: row.service_id,
    serviceName: row.service_name,
    staffId: row.staff_id,
    staffName: row.staff_name,
    clientId: row.client_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    priceMinor: row.price_minor,
    invoiceId: row.invoice_id,
  };
}

function unwrapRpc<T extends { ok?: boolean; code?: string }>(
  data: unknown,
  error: { message: string } | null,
): T {
  if (error) throw error;
  const result = data as T;
  if (result && result.ok === false) {
    throw new AppointmentRpcError((result.code as AppointmentErrorCode) ?? 'unknown');
  }
  return result;
}

// ---------------------------------------------------------------------------
// list_appointments: keyset-paginated list with filters (CLAUDE.md §6)
// ---------------------------------------------------------------------------

export type AppointmentListFilters = {
  branchId?: string | null;
  staffId?: string | null;
  status?: AppointmentStatus | null;
  serviceId?: string | null;
  /** One client's visit history (the client profile screen). */
  clientId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  search?: string;
};

type AppointmentListPage = {
  rows: AppointmentRow[];
  nextCursor: { starts_at: string; id: string } | null;
};

/** `live: true` = poll every 30 s while focused and visible (the Calendar list tab only). */
export function useAppointmentList(
  businessId: string | null,
  filters: AppointmentListFilters,
  options: { live?: boolean } = {},
) {
  const { isAuthenticated } = useSession();
  const refetchInterval = useLiveRefetchInterval(options.live ?? false);
  const { branchId, staffId, status, serviceId, clientId, fromDate, toDate, search = '' } = filters;

  return useInfiniteQuery<AppointmentListPage>({
    queryKey: appointmentKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      search,
      filters: { staffId, status, serviceId, clientId, fromDate, toDate },
    }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    refetchInterval,
    initialPageParam: null as { starts_at: string; id: string } | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as { starts_at: string; id: string } | null;
      const { data, error } = await getSupabase().rpc('list_appointments', {
        p_business_id: businessId ?? '',
        p_branch_id: branchId ?? undefined,
        p_staff_id: staffId ?? undefined,
        p_status: status ?? undefined,
        p_service_id: serviceId ?? undefined,
        p_client_id: clientId ?? undefined,
        p_from_date: fromDate ?? undefined,
        p_to_date: toDate ?? undefined,
        p_search: search || undefined,
        p_limit: 20,
        p_cursor_starts_at: cursor?.starts_at,
        p_cursor_id: cursor?.id,
      });
      if (error) throw error;
      const result = data as {
        rows: RawAppointmentRow[];
        next_cursor: AppointmentListPage['nextCursor'];
      };
      return {
        rows: (result.rows ?? []).map(mapRow),
        nextCursor: result.next_cursor ?? null,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// get_calendar_appointments: Day/Week grid data
// ---------------------------------------------------------------------------

export type CalendarAppointment = {
  id: string;
  startsAt: UtcIso;
  endsAt: UtcIso;
  status: AppointmentStatus;
  staffId: string | null;
  staffName: string | null;
  serviceId: string;
  serviceName: string;
  clientId: string;
  clientName: string;
};

/**
 * `get_calendar_appointments` returns fewer columns than `list_appointments`
 * (no source/client phone/price/invoice — CLAUDE.md §6, "no select('*')",
 * it only returns what a calendar grid needs). Shared by `DayView` and
 * `TodayScreen`, both of which open the SAME `AppointmentDetailDrawer` on a
 * calendar row and need to pad it out to the full `AppointmentRow` shape.
 */
export function calendarAppointmentToRow(
  row: CalendarAppointment,
  branchId: string,
): AppointmentRow {
  return {
    id: row.id,
    branchId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    source: null,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    staffId: row.staffId,
    staffName: row.staffName,
    clientId: row.clientId,
    clientName: row.clientName,
    clientPhone: null,
    priceMinor: null,
    invoiceId: null,
  };
}

export function useCalendarAppointments(
  businessId: string | null,
  branchId: string | null,
  fromDate: string,
  toDate: string,
  staffIds?: string[] | null,
  /** `live: true` = poll every 30 s while focused and visible (Today and Calendar only). */
  options: { live?: boolean } = {},
): UseQueryResult<{ timezone: string; rows: CalendarAppointment[] }, Error> {
  const { isAuthenticated } = useSession();
  const refetchInterval = useLiveRefetchInterval(options.live ?? false);

  return useQuery({
    queryKey: appointmentKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      filters: { view: 'calendar', fromDate, toDate, staffIds: staffIds ?? null },
    }),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    staleTime: staleTimes.live,
    refetchInterval,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_calendar_appointments', {
        p_business_id: businessId ?? '',
        p_branch_id: branchId ?? '',
        p_from_date: fromDate,
        p_to_date: toDate,
        p_staff_ids: staffIds ?? undefined,
      });
      if (error) throw error;
      const result = data as {
        timezone: string;
        rows: {
          id: string;
          starts_at: string;
          ends_at: string;
          status: AppointmentStatus;
          staff_id: string | null;
          staff_name: string | null;
          service_id: string;
          service_name: string;
          client_id: string;
          client_name: string;
        }[];
      };
      return {
        timezone: result.timezone,
        rows: (result.rows ?? []).map((row) => ({
          id: row.id,
          startsAt: row.starts_at as UtcIso,
          endsAt: row.ends_at as UtcIso,
          status: row.status,
          staffId: row.staff_id,
          staffName: row.staff_name,
          serviceId: row.service_id,
          serviceName: row.service_name,
          clientId: row.client_id,
          clientName: row.client_name,
        })),
      };
    },
  });
}

function invalidateAppointments(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: string | null,
) {
  void queryClient.invalidateQueries({
    queryKey: appointmentKeys.business(businessId ?? 'none'),
  });
}

// ---------------------------------------------------------------------------
// Write RPCs
// ---------------------------------------------------------------------------

export type CreateAppointmentInput = {
  branchId: string;
  serviceId: string;
  startsAt: string;
  staffId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientNotes?: string | null;
  internalNotes?: string | null;
  source?: BookingSource;
  autoConfirm?: boolean;
};

export function useCreateAppointment(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true; appointment_id: string }, Error, CreateAppointmentInput>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('create_appointment', {
        p_branch_id: input.branchId,
        p_service_id: input.serviceId,
        p_starts_at: input.startsAt,
        p_staff_id: input.staffId ?? undefined,
        p_client_id: input.clientId ?? undefined,
        p_client_name: input.clientName ?? undefined,
        p_client_phone: input.clientPhone ?? undefined,
        p_client_email: input.clientEmail ?? undefined,
        p_client_notes: input.clientNotes ?? undefined,
        p_internal_notes: input.internalNotes ?? undefined,
        p_source: input.source ?? undefined,
        p_auto_confirm: input.autoConfirm ?? undefined,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => invalidateAppointments(queryClient, businessId),
  });
}

export type UpdateAppointmentInput = {
  appointmentId: string;
  startsAt?: string;
  staffId?: string | null;
  clientNotes?: string | null;
  internalNotes?: string | null;
  clearClientNotes?: boolean;
  clearInternalNotes?: boolean;
};

export function useUpdateAppointment(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, UpdateAppointmentInput>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('update_appointment', {
        p_appointment_id: input.appointmentId,
        p_starts_at: input.startsAt ?? undefined,
        p_staff_id: input.staffId ?? undefined,
        p_client_notes: input.clientNotes ?? undefined,
        p_internal_notes: input.internalNotes ?? undefined,
        p_clear_client_notes: input.clearClientNotes ?? undefined,
        p_clear_internal_notes: input.clearInternalNotes ?? undefined,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => invalidateAppointments(queryClient, businessId),
  });
}

export function useCancelAppointment(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, { appointmentId: string; reason?: string }>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('cancel_appointment', {
        p_appointment_id: input.appointmentId,
        p_reason: input.reason ?? undefined,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => invalidateAppointments(queryClient, businessId),
  });
}

export function useMarkNoShow(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, { appointmentId: string }>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('mark_no_show', {
        p_appointment_id: input.appointmentId,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => invalidateAppointments(queryClient, businessId),
  });
}

/** Present only when the completion just created a review request (Phase 7). The raw token is shown once. */
export type CompletedResult = {
  ok: true;
  review_request?: { token: string; expires_at: string };
};

export function useMarkCompleted(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<CompletedResult, Error, { appointmentId: string }>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('mark_completed', {
        p_appointment_id: input.appointmentId,
      });
      return unwrapRpc<CompletedResult>(data, error);
    },
    onSuccess: () => invalidateAppointments(queryClient, businessId),
  });
}

export function useApproveAppointment(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, { appointmentId: string }>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('approve_appointment', {
        p_appointment_id: input.appointmentId,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => invalidateAppointments(queryClient, businessId),
  });
}

export function useReopenAppointment(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, { appointmentId: string }>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('reopen_appointment', {
        p_appointment_id: input.appointmentId,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => invalidateAppointments(queryClient, businessId),
  });
}
