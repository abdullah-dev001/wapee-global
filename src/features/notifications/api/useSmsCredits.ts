import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import type { IdCursor } from '../messageLogic';

export const smsCreditKeys = createQueryKeys('sms-credits');

export const LEDGER_PAGE_SIZE = 20;

export type LedgerKind = 'purchase' | 'adjustment' | 'debit' | 'refund';

export type LedgerRow = {
  id: number;
  kind: LedgerKind;
  amount: number;
  balanceAfter: number;
  segments: number | null;
  encoding: string | null;
  dialCode: string | null;
  note: string | null;
  createdAt: string;
};

/** The business balance in credits (1 credit = USD 0.001). No account row yet = 0. */
export function useSmsBalance(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: smsCreditKeys.detail({ businessId: businessId ?? 'none' }, 'balance'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    queryFn: async (): Promise<number> => {
      const { data, error } = await getSupabase()
        .from('sms_credit_accounts')
        .select('balance')
        .eq('business_id', businessId ?? '')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.balance ?? 0;
    },
  });
}

type LedgerPage = { items: LedgerRow[]; nextCursor: IdCursor | null };

/** Ledger, newest first, keyset on the row id. Server-side: 20 per page. */
export function useSmsLedger(businessId: string | null) {
  const { isAuthenticated } = useSession();

  return useInfiniteQuery<LedgerPage>({
    queryKey: smsCreditKeys.list({ businessId: businessId ?? 'none', pageSize: LEDGER_PAGE_SIZE }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    initialPageParam: null as IdCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      let query = getSupabase()
        .from('sms_credit_ledger')
        .select('id, kind, amount, balance_after, segments, encoding, dial_code, note, created_at')
        .eq('business_id', businessId ?? '')
        .order('id', { ascending: false })
        .limit(LEDGER_PAGE_SIZE);
      if (pageParam !== null) query = query.lt('id', pageParam as number);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const items: LedgerRow[] = rows.map((r) => ({
        id: r.id,
        kind: r.kind as LedgerKind,
        amount: r.amount,
        balanceAfter: r.balance_after,
        segments: r.segments,
        encoding: r.encoding,
        dialCode: r.dial_code,
        note: r.note,
        createdAt: r.created_at,
      }));
      return {
        items,
        nextCursor: rows.length === LEDGER_PAGE_SIZE ? (rows[rows.length - 1]?.id ?? null) : null,
      };
    },
  });
}
