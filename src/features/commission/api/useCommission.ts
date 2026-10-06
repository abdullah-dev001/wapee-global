import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';

import { type CommissionRule, type ReportRow, type SetRuleInput } from '../commissionLogic';

export const commissionKeys = createQueryKeys('commission');

const rec = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Every version of every rule for one staff member (RLS limits who may read them). */
export function useCommissionRules(businessId: string | null, staffId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: commissionKeys.list({
      businessId: businessId ?? 'none',
      filters: { rulesFor: staffId },
    }),
    enabled: isAuthenticated && Boolean(businessId) && Boolean(staffId),
    staleTime: staleTimes.list,
    queryFn: async (): Promise<CommissionRule[]> => {
      const { data, error } = await getSupabase()
        .from('commission_rules')
        .select(
          'id, staff_id, service_id, kind, percent_bp, flat_minor, currency, effective_from, created_at',
        )
        .eq('business_id', businessId ?? '')
        .eq('staff_id', staffId ?? '')
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        staffId: row.staff_id,
        serviceId: row.service_id,
        kind: row.kind,
        percentBp: row.percent_bp,
        flatMinor: row.flat_minor === null ? null : Number(row.flat_minor),
        currency: row.currency,
        effectiveFrom: row.effective_from,
        createdAt: row.created_at,
      }));
    },
  });
}

export function useSetCommissionRule(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<
    undefined,
    Error,
    { staffId: string; serviceId: string | null; input: SetRuleInput; effectiveFrom: string }
  >({
    mutationFn: async ({ staffId, serviceId, input, effectiveFrom }) => {
      const { data, error } = await getSupabase().rpc('set_commission_rule', {
        p_staff_id: staffId,
        // null = the staff member's default rule. The SQL parameter is nullable, but the
        // generated type cannot say so for a parameter that has no default.
        p_service_id: serviceId as string,
        p_kind: input.kind,
        p_percent_bp: input.kind === 'percent' ? input.percentBp : undefined,
        p_flat_minor: input.kind === 'flat' ? input.flatMinor : undefined,
        p_currency: input.kind === 'flat' ? input.currency : undefined,
        p_effective_from: effectiveFrom,
      });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      if (businessId)
        void queryClient.invalidateQueries({ queryKey: commissionKeys.scope({ businessId }) });
    },
  });
}

/** The signed-in person's own staff profile in this business (null when they are not staff). */
export function useMyStaffId(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: commissionKeys.detail({ businessId: businessId ?? 'none' }, 'my-staff'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await getSupabase().rpc('my_staff_profile_id', {
        p_business_id: businessId ?? '',
      });
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });
}

export type CommissionReport = {
  rows: ReportRow[];
  totals: { currency: string; earnedMinor: number; reversedMinor: number; netMinor: number }[];
};

/**
 * Commission per staff member and currency for a local-date range
 * (`get_commission_report`). The server decides who sees whom: view_all holders
 * see the team, view_own holders only themselves.
 */
export function useCommissionReport(
  businessId: string | null,
  branchId: string | null,
  from: string,
  to: string,
  staffId: string | null = null,
  enabled = true,
) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: commissionKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      filters: { report: true, from, to, staffId },
    }),
    enabled: isAuthenticated && Boolean(businessId) && enabled,
    staleTime: staleTimes.liveShort,
    queryFn: async (): Promise<CommissionReport> => {
      const { data, error } = await getSupabase().rpc('get_commission_report', {
        p_business_id: businessId ?? '',
        p_from: from,
        p_to: to,
        p_branch_id: branchId ?? undefined,
        p_staff_id: staffId ?? undefined,
      });
      const r = unwrapRpc<Record<string, unknown>>(data, error);
      return {
        rows: (Array.isArray(r.rows) ? r.rows : []).map((entry): ReportRow => {
          const e = rec(entry);
          return {
            staffId: str(e.staff_id),
            staffName: str(e.staff_name),
            currency: str(e.currency),
            earnedMinor: num(e.earned_minor),
            reversedMinor: num(e.reversed_minor),
            netMinor: num(e.net_minor),
            invoiceCount: num(e.invoice_count),
          };
        }),
        totals: (Array.isArray(r.totals_by_currency) ? r.totals_by_currency : []).map((entry) => {
          const e = rec(entry);
          return {
            currency: str(e.currency),
            earnedMinor: num(e.earned_minor),
            reversedMinor: num(e.reversed_minor),
            netMinor: num(e.net_minor),
          };
        }),
      };
    },
  });
}

export type CommissionEntry = {
  id: string;
  kind: 'earn' | 'reversal';
  amountMinor: number;
  currency: string;
  reason: string;
  createdAt: string;
};

/** The latest ledger rows for one staff member (server-side limit; RLS: own or branch view_all). */
export function useCommissionEntries(
  businessId: string | null,
  staffId: string | null,
  limit: number,
) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: commissionKeys.list({
      businessId: businessId ?? 'none',
      filters: { entriesFor: staffId },
      pageSize: limit,
    }),
    enabled: isAuthenticated && Boolean(businessId) && Boolean(staffId),
    staleTime: staleTimes.liveShort,
    queryFn: async (): Promise<CommissionEntry[]> => {
      const { data, error } = await getSupabase()
        .from('commission_entries')
        .select('id, kind, amount_minor, currency, reason, created_at')
        .eq('business_id', businessId ?? '')
        .eq('staff_id', staffId ?? '')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        amountMinor: Number(row.amount_minor),
        currency: row.currency,
        reason: row.reason,
        createdAt: row.created_at,
      }));
    },
  });
}
