import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';

export const scheduleKeys = createQueryKeys('report-schedules');

export type ReportSchedule = {
  id: string;
  branchId: string | null;
  frequency: 'weekly' | 'monthly';
  sendHour: number;
  isEnabled: boolean;
};

/** The business's report schedules (RLS: people who may manage them; others get none). */
export function useReportSchedules(businessId: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: scheduleKeys.list({ businessId: businessId ?? 'none' }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.list,
    queryFn: async (): Promise<ReportSchedule[]> => {
      const { data, error } = await getSupabase()
        .from('report_schedules')
        .select('id, branch_id, frequency, send_hour, is_enabled')
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null)
        .order('frequency');
      if (error) throw new Error(error.message);
      return (data ?? []).flatMap((row): ReportSchedule[] =>
        row.frequency === 'weekly' || row.frequency === 'monthly'
          ? [
              {
                id: row.id,
                branchId: row.branch_id,
                frequency: row.frequency,
                sendHour: row.send_hour,
                isEnabled: row.is_enabled,
              },
            ]
          : [],
      );
    },
  });
}

export function useSetReportSchedule(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<
    undefined,
    Error,
    { frequency: 'weekly' | 'monthly'; enabled: boolean; sendHour: number }
  >({
    mutationFn: async ({ frequency, enabled, sendHour }) => {
      const { data, error } = await getSupabase().rpc('set_report_schedule', {
        p_business_id: businessId ?? '',
        p_frequency: frequency,
        p_enabled: enabled,
        p_send_hour: sendHour,
      });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      if (businessId)
        void queryClient.invalidateQueries({ queryKey: scheduleKeys.business(businessId) });
    },
  });
}
