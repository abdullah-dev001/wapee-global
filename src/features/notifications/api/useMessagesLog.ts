import { useInfiniteQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import type { IdCursor, MessageChannel } from '../messageLogic';

export const messageLogKeys = createQueryKeys('message-log');

export const LOG_PAGE_SIZE = 20;

export type MessageLogFilters = {
  branchId: string | null;
  channel: MessageChannel | null;
  status: 'sent' | 'failed' | 'skipped' | null;
};

export type MessageLogRow = {
  id: number;
  channel: MessageChannel;
  event: string;
  status: 'sent' | 'failed' | 'skipped';
  code: string | null;
  recipientMasked: string | null;
  segments: number | null;
  credits: number | null;
  error: string | null;
  createdAt: string;
};

type Page = { items: MessageLogRow[]; nextCursor: IdCursor | null };

/**
 * The messages log (RLS: settings.booking). Masked recipient, status, cost and a
 * short scrubbed error only: the table never holds a body, address or link.
 */
export function useMessagesLog(businessId: string | null, filters: MessageLogFilters) {
  const { isAuthenticated } = useSession();

  return useInfiniteQuery<Page>({
    queryKey: messageLogKeys.list({
      businessId: businessId ?? 'none',
      branchId: filters.branchId,
      filters: { channel: filters.channel, status: filters.status },
      pageSize: LOG_PAGE_SIZE,
    }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    initialPageParam: null as IdCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      let query = getSupabase()
        .from('messages')
        .select(
          'id, channel, event, status, code, recipient_masked, segments, credits, error, created_at',
        )
        .eq('business_id', businessId ?? '')
        .order('id', { ascending: false })
        .limit(LOG_PAGE_SIZE);
      if (filters.branchId) query = query.eq('branch_id', filters.branchId);
      if (filters.channel) query = query.eq('channel', filters.channel);
      if (filters.status) query = query.eq('status', filters.status);
      if (pageParam !== null) query = query.lt('id', pageParam as number);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return {
        items: rows.map((r) => ({
          id: r.id,
          channel: r.channel as MessageChannel,
          event: r.event,
          status: r.status as MessageLogRow['status'],
          code: r.code,
          recipientMasked: r.recipient_masked,
          segments: r.segments,
          credits: r.credits,
          error: r.error,
          createdAt: r.created_at,
        })),
        nextCursor: rows.length === LOG_PAGE_SIZE ? (rows[rows.length - 1]?.id ?? null) : null,
      };
    },
  });
}
