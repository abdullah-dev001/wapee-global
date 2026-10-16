import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { InvoiceRpcError } from '../types';
import { reportKeys } from './useInvoices';

import { type Raw } from './mappers';
import { mapReport } from './reportMapper';

export type {
  BasicReport,
  PeriodReport,
  ReportPeriod,
  RevenueRow,
  TopService,
} from './reportMapper';

/** Today + this month in each branch's own timezone. Revenue arrives per currency and is never merged. */
export function useBasicReport(businessId: string | null, branchId: string | null) {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: reportKeys.detail({ businessId: businessId ?? 'none', branchId }, 'basic'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_basic_report', {
        p_business_id: businessId ?? '',
        p_branch_id: branchId ?? undefined,
      });
      if (error) throw error;
      const result = (data ?? {}) as Raw;
      if (result.ok === false) throw new InvoiceRpcError(String(result.code ?? 'unknown'));
      return mapReport(result);
    },
  });
}
