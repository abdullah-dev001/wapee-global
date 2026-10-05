import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import type { ClientEvent } from '../messageLogic';

export const messagePreviewKeys = createQueryKeys('message-preview');

export type MessagePreview = {
  subject: string | null;
  text: string;
  encoding: string | null;
  units: number;
  segments: number;
  creditsPerSegment: number | null;
  credits: number | null;
  rateAvailable: boolean | null;
  countryCode: string | null;
};

/**
 * What the customer will receive, rendered by the SAME templates the worker uses
 * (Edge Function `message_preview`), plus segments and credits for SMS. The
 * templates live in one place; this screen never copies them.
 */
export function useMessagePreview(input: {
  businessId: string | null;
  branchId: string | null;
  event: ClientEvent;
  channel: 'email' | 'sms';
}) {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: messagePreviewKeys.detail(
      { businessId: input.businessId ?? 'none', branchId: input.branchId },
      `${input.event}:${input.channel}`,
    ),
    enabled: isAuthenticated && Boolean(input.businessId && input.branchId),
    staleTime: staleTimes.static,
    queryFn: async (): Promise<MessagePreview> => {
      const { data, error } = await getSupabase().functions.invoke('message_preview', {
        body: { branch_id: input.branchId, event: input.event, channel: input.channel },
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as { ok?: boolean; data?: Record<string, unknown> };
      if (r.ok !== true || !r.data) throw new Error('preview unavailable');
      const d = r.data;
      return {
        subject: typeof d.subject === 'string' ? d.subject : null,
        text: String(d.text ?? ''),
        encoding: typeof d.encoding === 'string' ? d.encoding : null,
        units: Number(d.units ?? 0),
        segments: Number(d.segments ?? 0),
        creditsPerSegment: typeof d.credits_per_segment === 'number' ? d.credits_per_segment : null,
        credits: typeof d.credits === 'number' ? d.credits : null,
        rateAvailable: typeof d.rate_available === 'boolean' ? d.rate_available : null,
        countryCode: typeof d.country_code === 'string' ? d.country_code : null,
      };
    },
  });
}
