import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { appointmentKeys } from '@/features/appointments/api/useAppointments';
import { useSession } from '@/features/auth';
import { lowStockKeys, movementKeys, productKeys } from '@/features/inventory/api/useInventory';
import { clientPackageKeys } from '@/features/packages/api/usePackages';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { mapInvoiceDetail, mapListRow, type Raw } from './mappers';
import {
  InvoiceRpcError,
  type InvoiceDetail,
  type InvoiceListRow,
  type InvoiceStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '../types';

export const invoiceKeys = createQueryKeys('invoices');
export const reportKeys = createQueryKeys('reports');

/** `{ok:false,code}` -> `InvoiceRpcError`; a transport error stays a plain Error. */
function unwrap(data: unknown, error: { message: string } | null): Raw {
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as Raw;
  if (result.ok === false) throw new InvoiceRpcError(String(result.code ?? 'unknown'));
  return result;
}

// ---------------------------------------------------------------------------
// list_invoices (keyset pagination, server-side filters + search)
// ---------------------------------------------------------------------------

export type InvoiceListFilters = {
  branchId?: string | null;
  status?: InvoiceStatus | null;
  paymentStatus?: Exclude<PaymentStatus, never> | null;
  clientId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  search?: string;
};

type InvoiceListPage = {
  rows: InvoiceListRow[];
  nextCursor: { at: string; id: string } | null;
};

export function useInvoiceList(businessId: string | null, filters: InvoiceListFilters) {
  const { isAuthenticated } = useSession();
  const { branchId, status, paymentStatus, clientId, fromDate, toDate, search = '' } = filters;

  return useInfiniteQuery<InvoiceListPage>({
    queryKey: invoiceKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      search,
      filters: { status, paymentStatus, clientId, fromDate, toDate },
    }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    initialPageParam: null as { at: string; id: string } | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as { at: string; id: string } | null;
      const { data, error } = await getSupabase().rpc('list_invoices', {
        p_business_id: businessId ?? '',
        p_branch_id: branchId ?? undefined,
        p_status: status ?? undefined,
        p_payment_status: paymentStatus ?? undefined,
        p_client_id: clientId ?? undefined,
        p_from_date: fromDate ?? undefined,
        p_to_date: toDate ?? undefined,
        p_search: search.length >= 2 ? search : undefined,
        p_limit: 20,
        p_cursor_at: cursor?.at,
        p_cursor_id: cursor?.id,
      });
      const result = unwrap(data, error);
      const rows = ((result.rows as Raw[] | undefined) ?? []).map(mapListRow);
      const next = result.next_cursor as { at: string; id: string } | null | undefined;
      return { rows, nextCursor: next ?? null };
    },
  });
}

// ---------------------------------------------------------------------------
// get_invoice_print_data: the detail AND the print view read the same payload
// ---------------------------------------------------------------------------

export function useInvoiceDetail(
  businessId: string | null,
  invoiceId: string | null,
): UseQueryResult<InvoiceDetail, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: invoiceKeys.detail({ businessId: businessId ?? 'none' }, invoiceId ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId && invoiceId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_invoice_print_data', {
        p_invoice_id: invoiceId ?? '',
      });
      return mapInvoiceDetail(unwrap(data, error));
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations. Each invalidates PRECISE keys: invoice lists/details in the
// business, the reports (money changed), and — when an appointment link may
// have moved — the appointment queries (detail, Today and Calendar read them).
// ---------------------------------------------------------------------------

function useInvalidate(businessId: string | null) {
  const queryClient = useQueryClient();
  const scope = { businessId: businessId ?? 'none' };
  return (opts: { appointments?: boolean; reports?: boolean; addons?: boolean } = {}) => {
    void queryClient.invalidateQueries({ queryKey: invoiceKeys.business(scope.businessId) });
    // Issuing sells packages and drops stock; a credit note cancels / restores them (Phase 10).
    if (opts.addons) {
      void queryClient.invalidateQueries({
        queryKey: clientPackageKeys.business(scope.businessId),
      });
      void queryClient.invalidateQueries({ queryKey: productKeys.business(scope.businessId) });
      void queryClient.invalidateQueries({ queryKey: movementKeys.business(scope.businessId) });
      void queryClient.invalidateQueries({ queryKey: lowStockKeys.business(scope.businessId) });
    }
    if (opts.reports)
      void queryClient.invalidateQueries({ queryKey: reportKeys.business(scope.businessId) });
    if (opts.appointments) {
      void queryClient.invalidateQueries({ queryKey: appointmentKeys.business(scope.businessId) });
    }
  };
}

export type DraftLineInput = {
  serviceId?: string | null;
  packageId?: string | null;
  productId?: string | null;
  description?: string;
  quantity: number;
  unitPriceMinor?: number;
  discountMinor?: number;
  discountReason?: string | null;
};

function itemsJson(items: readonly DraftLineInput[]) {
  return items.map((item) => ({
    service_id: item.serviceId ?? null,
    package_id: item.packageId ?? null,
    product_id: item.productId ?? null,
    description: item.description,
    quantity: item.quantity,
    unit_price_minor: item.unitPriceMinor,
    discount_minor: item.discountMinor ?? 0,
    discount_reason: item.discountReason ?? null,
  }));
}

export type CreateDraftInput = {
  branchId?: string | null;
  appointmentId?: string | null;
  clientId?: string | null;
  items?: readonly DraftLineInput[] | null;
  notes?: string | null;
};

/** Creates a draft (blank/free-text, or prefilled from a completed appointment). Returns the invoice id. */
export function useCreateInvoiceDraft(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<string, Error, CreateDraftInput>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('create_invoice_draft', {
        p_branch_id: input.branchId ?? undefined,
        p_appointment_id: input.appointmentId ?? undefined,
        p_client_id: input.clientId ?? undefined,
        p_items: input.items ? itemsJson(input.items) : undefined,
        p_notes: input.notes ?? undefined,
      });
      return String(unwrap(data, error).invoice_id);
    },
    onSuccess: () => invalidate({ appointments: true }),
  });
}

export type UpdateDraftInput = {
  invoiceId: string;
  items?: readonly DraftLineInput[];
  clientId?: string | null;
  clearClient?: boolean;
  notes?: string | null;
  clearNotes?: boolean;
};

export function useUpdateInvoiceDraft(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, UpdateDraftInput>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('update_invoice_draft', {
        p_invoice_id: input.invoiceId,
        p_items: input.items ? itemsJson(input.items) : undefined,
        p_client_id: input.clientId ?? undefined,
        p_clear_client: input.clearClient ?? false,
        p_notes: input.notes ?? undefined,
        p_clear_notes: input.clearNotes ?? false,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDiscardInvoiceDraft(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, { invoiceId: string }>({
    mutationFn: async ({ invoiceId }) => {
      const { data, error } = await getSupabase().rpc('discard_invoice_draft', {
        p_invoice_id: invoiceId,
      });
      unwrap(data, error);
      return undefined;
    },
    // Discarding clears appointments.invoice_id.
    onSuccess: () => invalidate({ appointments: true }),
  });
}

export function useIssueInvoice(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<{ number: string }, Error, { invoiceId: string }>({
    mutationFn: async ({ invoiceId }) => {
      const { data, error } = await getSupabase().rpc('issue_invoice', { p_invoice_id: invoiceId });
      return { number: String(unwrap(data, error).number) };
    },
    onSuccess: () => invalidate({ reports: true, addons: true }),
  });
}

export function useAddPayment(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<
    undefined,
    Error,
    {
      invoiceId: string;
      method: PaymentMethod;
      amountMinor: number;
      paidAt?: string | null;
      note?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('add_payment', {
        p_invoice_id: input.invoiceId,
        p_method: input.method,
        p_amount_minor: input.amountMinor,
        p_paid_at: input.paidAt ?? undefined,
        p_note: input.note ?? undefined,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: () => invalidate({ reports: true }),
  });
}

export function useReversePayment(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<
    undefined,
    Error,
    { paymentId: string; reason: string; amountMinor?: number | null }
  >({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('reverse_payment', {
        p_payment_id: input.paymentId,
        p_reason: input.reason,
        p_amount_minor: input.amountMinor ?? undefined,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: () => invalidate({ reports: true }),
  });
}

export function useCreateCreditNote(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<
    undefined,
    Error,
    { invoiceId: string; reason: string; netMinor?: number | null }
  >({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('create_credit_note', {
        p_invoice_id: input.invoiceId,
        p_reason: input.reason,
        p_net_minor: input.netMinor ?? undefined,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: () => invalidate({ reports: true, addons: true }),
  });
}
