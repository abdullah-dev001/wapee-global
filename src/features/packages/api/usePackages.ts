import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { rpcNull, unwrapRpc } from '@/lib/supabase/rpcResult';

import { type ClientPackage, type SessionUsage } from '../packageLogic';
import { type PackageValues } from '../schemas/package.schemas';

export const packageKeys = createQueryKeys('packages');
export const clientPackageKeys = createQueryKeys('client-packages');
export const usageKeys = createQueryKeys('session-usages');

const PAGE_SIZE = 20;

export type PackageListItem = {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  sessions: number;
  bonusSessions: number;
  priceMinor: number;
  currency: string;
  expiryDays: number | null;
  isActive: boolean;
  serviceIds: string[];
};

type PackagePage = { rows: PackageListItem[]; nextOffset: number | null };

/** Package definitions of one branch. Server-side search (trigram) and pages of 20 (CLAUDE.md §6). */
export function usePackages(
  businessId: string | null,
  branchId: string | null,
  options: { search?: string; includeInactive?: boolean } = {},
) {
  const { isAuthenticated } = useSession();
  const { search = '', includeInactive = true } = options;

  return useInfiniteQuery<PackagePage>({
    queryKey: packageKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      search,
      filters: { includeInactive },
    }),
    enabled: isAuthenticated && Boolean(businessId) && Boolean(branchId),
    staleTime: staleTimes.list,
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      let query = getSupabase()
        .from('packages')
        .select(
          'id, branch_id, name, description, sessions, bonus_sessions, price_minor, currency, expiry_days, is_active, package_services(service_id)',
        )
        .eq('business_id', businessId ?? '')
        .eq('branch_id', branchId ?? '')
        .is('deleted_at', null);
      if (!includeInactive) query = query.eq('is_active', true);
      if (search.length >= 2) query = query.ilike('name', `%${search}%`);

      const { data, error } = await query
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE);
      if (error) throw new Error(error.message);

      const all = data ?? [];
      const hasMore = all.length > PAGE_SIZE;
      return {
        rows: (hasMore ? all.slice(0, PAGE_SIZE) : all).map((row) => ({
          id: row.id,
          branchId: row.branch_id,
          name: row.name,
          description: row.description,
          sessions: row.sessions,
          bonusSessions: row.bonus_sessions,
          priceMinor: row.price_minor,
          currency: row.currency,
          expiryDays: row.expiry_days,
          isActive: row.is_active,
          serviceIds: (row.package_services ?? []).map((s) => s.service_id),
        })),
        nextOffset: hasMore ? offset + PAGE_SIZE : null,
      };
    },
  });
}

/** Active packages of a branch for the invoice editor's picker (at most 100: the server cap). */
export function usePackageOptions(
  businessId: string | null,
  branchId: string | null,
  enabled: boolean,
): UseQueryResult<PackageListItem[], Error> {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: packageKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      filters: { options: true },
      pageSize: 100,
    }),
    enabled: isAuthenticated && enabled && Boolean(businessId) && Boolean(branchId),
    staleTime: staleTimes.list,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('packages')
        .select(
          'id, branch_id, name, description, sessions, bonus_sessions, price_minor, currency, expiry_days, is_active, package_services(service_id)',
        )
        .eq('business_id', businessId ?? '')
        .eq('branch_id', branchId ?? '')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        branchId: row.branch_id,
        name: row.name,
        description: row.description,
        sessions: row.sessions,
        bonusSessions: row.bonus_sessions,
        priceMinor: row.price_minor,
        currency: row.currency,
        expiryDays: row.expiry_days,
        isActive: row.is_active,
        serviceIds: (row.package_services ?? []).map((s) => s.service_id),
      }));
    },
  });
}

function invalidatePackages(queryClient: ReturnType<typeof useQueryClient>, businessId: string) {
  void queryClient.invalidateQueries({ queryKey: packageKeys.business(businessId) });
}

export function useSavePackage(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      branchId: string;
      packageId: string | null;
      values: PackageValues;
    }) => {
      const { values } = input;
      const { data, error } = await getSupabase().rpc('save_package', {
        p_branch_id: input.branchId,
        p_package_id: input.packageId ?? rpcNull<string>(),
        p_name: values.name,
        p_description: values.description || rpcNull<string>(),
        p_sessions: values.sessions,
        p_bonus_sessions: values.bonusSessions,
        p_price_minor: values.priceMinor,
        p_expiry_days: values.expiryDays ?? rpcNull<number>(),
        p_service_ids: values.serviceIds,
        p_is_active: values.isActive,
      });
      return unwrapRpc<{ package_id: string }>(data, error);
    },
    onSuccess: () => businessId && invalidatePackages(queryClient, businessId),
  });
}

export function useDeletePackage(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (packageId: string) => {
      const { data, error } = await getSupabase().rpc('delete_package', {
        p_package_id: packageId,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => businessId && invalidatePackages(queryClient, businessId),
  });
}

/**
 * A client's packages with the balance the server computed. RLS (add-on on + a packages
 * permission) decides what comes back; `serviceId` keeps those usable for that service.
 */
export function useClientPackages(
  businessId: string | null,
  clientId: string | null,
  options: { serviceId?: string | null; usableOnly?: boolean; enabled?: boolean } = {},
): UseQueryResult<ClientPackage[], Error> {
  const { isAuthenticated } = useSession();
  const { serviceId = null, usableOnly = false, enabled = true } = options;

  return useQuery({
    queryKey: clientPackageKeys.list({
      businessId: businessId ?? 'none',
      filters: { clientId, serviceId, usableOnly },
    }),
    enabled: isAuthenticated && enabled && Boolean(businessId) && Boolean(clientId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('list_client_packages', {
        p_client_id: clientId ?? '',
        p_service_id: serviceId ?? undefined,
        p_usable_only: usableOnly,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        branchId: row.branch_id,
        name: row.name,
        sessionsPurchased: row.sessions_purchased,
        sessionsBonus: row.sessions_bonus,
        used: row.used,
        remaining: row.remaining,
        soldAt: row.sold_at,
        expiresAt: row.expires_at,
        isCancelled: row.is_cancelled,
        isExpired: row.is_expired,
        priceMinor: row.price_minor,
        currency: row.currency,
        invoiceId: row.invoice_id,
        serviceIds: row.service_ids ?? [],
      }));
    },
  });
}

/** Every deduction and reversal logged against one appointment. */
export function useAppointmentUsages(
  businessId: string | null,
  appointmentId: string | null,
  enabled: boolean,
): UseQueryResult<SessionUsage[], Error> {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: usageKeys.list({ businessId: businessId ?? 'none', filters: { appointmentId } }),
    enabled: isAuthenticated && enabled && Boolean(businessId) && Boolean(appointmentId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('session_usages')
        .select(
          'id, kind, client_package_id, appointment_id, reverses_usage_id, reason, created_at, created_by, client_packages(name)',
        )
        .eq('appointment_id', appointmentId ?? '')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        clientPackageId: row.client_package_id,
        packageName: row.client_packages?.name ?? '',
        appointmentId: row.appointment_id,
        reversesUsageId: row.reverses_usage_id,
        reason: row.reason,
        createdAt: row.created_at,
        createdBy: row.created_by,
      }));
    },
  });
}

/** Every package/usage view changes together after a deduction or a reversal. */
function invalidateUsage(queryClient: ReturnType<typeof useQueryClient>, businessId: string) {
  void queryClient.invalidateQueries({ queryKey: clientPackageKeys.business(businessId) });
  void queryClient.invalidateQueries({ queryKey: usageKeys.business(businessId) });
}

export function useDeductSession(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { appointmentId: string; clientPackageId: string }) => {
      const { data, error } = await getSupabase().rpc('deduct_session', {
        p_appointment_id: input.appointmentId,
        p_client_package_id: input.clientPackageId,
      });
      return unwrapRpc<{ usage_id: string; remaining: number }>(data, error);
    },
    onSuccess: () => businessId && invalidateUsage(queryClient, businessId),
  });
}

export function useReverseSession(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { usageId: string; reason?: string }) => {
      const { data, error } = await getSupabase().rpc('reverse_session', {
        p_usage_id: input.usageId,
        p_reason: input.reason || undefined,
      });
      return unwrapRpc<{ reversal_id: string }>(data, error);
    },
    onSuccess: () => businessId && invalidateUsage(queryClient, businessId),
  });
}
