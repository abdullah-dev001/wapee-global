import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';

import { type PeriodKind } from '../periodLogic';
import {
  PARSERS,
  parsePeriod,
  type ReportPeriodInfo,
  type SectionData,
  type SectionKey,
} from '../reportTypes';

export const advancedReportKeys = createQueryKeys('advanced-report');

export type ReportQuery = {
  section: SectionKey;
  kind: PeriodKind;
  /** A local date inside the week/month (weekly, monthly). */
  anchor: string;
  /** Custom range. */
  from?: string;
  to?: string;
};

export type AdvancedReport<K extends SectionKey> = {
  period: ReportPeriodInfo;
  current: SectionData[K];
  previous: SectionData[K];
};

/**
 * One section of the advanced report for a period AND the previous equal period
 * (`get_advanced_report`). Each branch's day boundaries come from its own time
 * zone on the server; money arrives per currency.
 */
export function useAdvancedReport<K extends SectionKey>(
  businessId: string | null,
  branchId: string | null,
  query: ReportQuery & { section: K },
  enabled = true,
) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: advancedReportKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      filters: {
        section: query.section,
        kind: query.kind,
        anchor: query.anchor,
        from: query.from,
        to: query.to,
      },
    }),
    enabled: isAuthenticated && Boolean(businessId) && enabled,
    staleTime: staleTimes.liveShort,
    queryFn: async (): Promise<AdvancedReport<K>> => {
      const { data, error } = await getSupabase().rpc('get_advanced_report', {
        p_business_id: businessId ?? '',
        p_section: query.section,
        p_period: query.kind,
        p_anchor: query.kind === 'custom' ? undefined : query.anchor,
        p_from: query.kind === 'custom' ? query.from : undefined,
        p_to: query.kind === 'custom' ? query.to : undefined,
        p_branch_id: branchId ?? undefined,
      });
      const r = unwrapRpc<Record<string, unknown>>(data, error);
      const parse = PARSERS[query.section] as (raw: unknown) => SectionData[K];
      return {
        period: parsePeriod(r.period),
        current: parse(r.current),
        previous: parse(r.previous),
      };
    },
  });
}
