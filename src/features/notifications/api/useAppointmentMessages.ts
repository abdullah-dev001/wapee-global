import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { isMessageStatus, type MessageStatus } from '../messageLogic';

export const appointmentMessageKeys = createQueryKeys('appointment-messages');

export type AppointmentMessage = {
  event: string;
  channel: string;
  status: MessageStatus;
  code: string | null;
  at: string;
};

/**
 * Send status of the CLIENT messages of one appointment (RPC
 * `get_appointment_messages`: event/channel/status/code only, never a recipient).
 * Returns null when the caller may not see it (Staff at Own scope).
 */
export function useAppointmentMessages(
  businessId: string | null,
  appointmentId: string | null,
  enabled: boolean,
) {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: appointmentMessageKeys.detail(
      { businessId: businessId ?? 'none' },
      appointmentId ?? 'none',
    ),
    enabled: enabled && isAuthenticated && Boolean(businessId && appointmentId),
    staleTime: staleTimes.liveShort,
    queryFn: async (): Promise<AppointmentMessage[] | null> => {
      const { data, error } = await getSupabase().rpc('get_appointment_messages', {
        p_appointment_id: appointmentId ?? '',
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as { ok?: boolean; code?: string; items?: Record<string, unknown>[] };
      if (r.ok === false) {
        if (r.code === 'forbidden' || r.code === 'not_found') return null;
        throw new Error(r.code ?? 'unknown');
      }
      return (r.items ?? []).flatMap((i) =>
        isMessageStatus(i.status)
          ? [
              {
                event: String(i.event),
                channel: String(i.channel),
                status: i.status,
                code: typeof i.code === 'string' ? i.code : null,
                at: String(i.at),
              },
            ]
          : [],
      );
    },
  });
}
