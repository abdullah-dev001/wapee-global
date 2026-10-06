import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { planUsageKeys } from '@/features/plans/api/useMyFeatures';
import { grantKeys } from '@/lib/permissions';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';
import { type Json } from '@/lib/supabase/database.types';

import { type BranchPatch, type BranchRow, type MyBranch } from '../branchLogic';

export const branchKeys = createQueryKeys('branches');

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** The locations the signed-in person works in, with their roles there (`list_my_branches`). */
export function useMyBranches(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: branchKeys.list({ businessId: businessId ?? 'none', filters: { mine: true } }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.list,
    queryFn: async (): Promise<{ branches: MyBranch[]; currencies: number }> => {
      const { data, error } = await getSupabase().rpc('list_my_branches', {
        p_business_id: businessId ?? '',
      });
      const result = unwrapRpc<{ branches?: unknown; currencies?: unknown }>(data, error);
      const list = Array.isArray(result.branches) ? result.branches : [];
      return {
        currencies: num(result.currencies),
        branches: list.map((entry): MyBranch => {
          const r = asRecord(entry);
          return {
            id: str(r.id),
            name: str(r.name),
            isPrimary: r.is_primary === true,
            archived: r.archived === true,
            countryCode: str(r.country_code),
            currency: str(r.currency),
            timezone: str(r.timezone),
            roles: Array.isArray(r.roles) ? r.roles.map(String) : [],
          };
        }),
      };
    },
  });
}

/** Every branch with the settings the admin screen edits (RLS: members read them). */
export function useBranchAdmin(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: branchKeys.list({ businessId: businessId ?? 'none', filters: { admin: true } }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.list,
    queryFn: async (): Promise<BranchRow[]> => {
      const { data, error } = await getSupabase()
        .from('branches')
        .select(
          'id, name, is_primary, deleted_at, country_code, currency, timezone, address, phone, tax_number, tax_rate_bp, invoice_prefix, invoice_next_no',
        )
        .eq('business_id', businessId ?? '')
        .order('is_primary', { ascending: false })
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        isPrimary: row.is_primary,
        archived: row.deleted_at !== null,
        countryCode: row.country_code,
        currency: row.currency,
        timezone: row.timezone,
        address: row.address,
        phone: row.phone,
        taxNumber: row.tax_number,
        taxRateBp: row.tax_rate_bp,
        invoicePrefix: row.invoice_prefix,
        invoiceNextNo: Number(row.invoice_next_no),
      }));
    },
  });
}

function refresh(queryClient: QueryClient, businessId: string) {
  void queryClient.invalidateQueries({ queryKey: branchKeys.scope({ businessId }) });
  // The shell's business list carries each branch (names, primary flag).
  void queryClient.invalidateQueries({ queryKey: ['businesses', 'mine'] });
  void queryClient.invalidateQueries({ queryKey: planUsageKeys.scope({ businessId }) });
  void queryClient.invalidateQueries({ queryKey: grantKeys.forBusiness(businessId) });
  // Reports and combined views depend on which branches exist.
  void queryClient.invalidateQueries({ queryKey: ['advanced-report'] });
}

export type CreateBranchInput = {
  name: string;
  countryCode: string;
  currency: string;
  timezone: string;
  address: string;
  phone: string;
  taxNumber: string;
  taxRateBp: number;
  invoicePrefix: string;
  copyFromBranchId: string | null;
};

export function useCreateBranch(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<
    { branchId: string; servicesCopied: number; servicesSkipped: number },
    Error,
    CreateBranchInput
  >({
    mutationFn: async (input) => {
      if (!businessId) throw new Error('No business selected');
      const { data, error } = await getSupabase().rpc('create_branch', {
        p_business_id: businessId,
        p_name: input.name,
        p_country_code: input.countryCode,
        p_currency: input.currency,
        p_timezone: input.timezone,
        p_address: input.address || undefined,
        p_phone: input.phone || undefined,
        p_tax_number: input.taxNumber || undefined,
        p_tax_rate_bp: input.taxRateBp,
        p_invoice_prefix: input.invoicePrefix || undefined,
        p_copy_from_branch: input.copyFromBranchId ?? undefined,
      });
      const r = unwrapRpc<Record<string, unknown>>(data, error);
      return {
        branchId: str(r.branch_id),
        servicesCopied: num(r.services_copied),
        servicesSkipped: num(r.services_skipped_currency),
      };
    },
    onSuccess: () => {
      if (businessId) refresh(queryClient, businessId);
    },
  });
}

export function useUpdateBranch(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<undefined, Error, { branchId: string; patch: BranchPatch }>({
    mutationFn: async ({ branchId, patch }) => {
      const { data, error } = await getSupabase().rpc('update_branch', {
        p_branch_id: branchId,
        p_patch: patch as Json,
      });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      if (businessId) refresh(queryClient, businessId);
    },
  });
}

type BranchAction = 'archive_branch' | 'restore_branch' | 'set_primary_branch';

function useBranchAction(businessId: string | null, fn: BranchAction) {
  const queryClient = useQueryClient();
  return useMutation<undefined, Error, { branchId: string }>({
    mutationFn: async ({ branchId }) => {
      const { data, error } = await getSupabase().rpc(fn, { p_branch_id: branchId });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      if (businessId) refresh(queryClient, businessId);
    },
  });
}

export const useArchiveBranch = (businessId: string | null) =>
  useBranchAction(businessId, 'archive_branch');
export const useRestoreBranch = (businessId: string | null) =>
  useBranchAction(businessId, 'restore_branch');
export const useSetPrimaryBranch = (businessId: string | null) =>
  useBranchAction(businessId, 'set_primary_branch');

export type OverviewBranch = {
  branchId: string;
  name: string;
  currency: string;
  archived: boolean;
  invoiceCount: number | null;
  netRevenueMinor: number | null;
  collectedMinor: number | null;
  appointments: { total: number; completed: number; cancelled: number; noShow: number } | null;
};
export type OverviewTotal = {
  currency: string;
  branches: number;
  invoiceCount: number;
  netRevenueMinor: number;
  collectedMinor: number;
};
export type CombinedOverview = {
  branches: OverviewBranch[];
  totals: OverviewTotal[];
  appointments: { total: number; completed: number; cancelled: number; noShow: number };
};

const orNull = (value: unknown): number | null => (typeof value === 'number' ? value : null);

/** Per-branch figures and totals PER CURRENCY for a local-date range (`get_combined_overview`). */
export function useCombinedOverview(
  businessId: string | null,
  from: string,
  to: string,
  enabled = true,
) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: branchKeys.detail({ businessId: businessId ?? 'none' }, `overview:${from}:${to}`),
    enabled: isAuthenticated && Boolean(businessId) && enabled,
    staleTime: staleTimes.liveShort,
    queryFn: async (): Promise<CombinedOverview> => {
      const { data, error } = await getSupabase().rpc('get_combined_overview', {
        p_business_id: businessId ?? '',
        p_from: from,
        p_to: to,
      });
      const r = unwrapRpc<Record<string, unknown>>(data, error);
      const appts = (value: unknown) => {
        const a = asRecord(value);
        return {
          total: num(a.total),
          completed: num(a.completed),
          cancelled: num(a.cancelled),
          noShow: num(a.no_show),
        };
      };
      return {
        branches: (Array.isArray(r.branches) ? r.branches : []).map((entry): OverviewBranch => {
          const b = asRecord(entry);
          return {
            branchId: str(b.branch_id),
            name: str(b.name),
            currency: str(b.currency),
            archived: b.archived === true,
            invoiceCount: orNull(b.invoice_count),
            netRevenueMinor: orNull(b.net_revenue_minor),
            collectedMinor: orNull(b.collected_minor),
            appointments: b.appointments ? appts(b.appointments) : null,
          };
        }),
        totals: (Array.isArray(r.totals_by_currency) ? r.totals_by_currency : []).map(
          (entry): OverviewTotal => {
            const t = asRecord(entry);
            return {
              currency: str(t.currency),
              branches: num(t.branches),
              invoiceCount: num(t.invoice_count),
              netRevenueMinor: num(t.net_revenue_minor),
              collectedMinor: num(t.collected_minor),
            };
          },
        ),
        appointments: appts(r.appointments),
      };
    },
  });
}
