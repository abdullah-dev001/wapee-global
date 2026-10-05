import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import type { NotificationSettings } from '../schemas/notificationSettings.schema';

export const notificationKeys = createQueryKeys('notifications');

const SELECT =
  'reminders_enabled, reminder_hours_before, sms_enabled, review_requests_enabled, quiet_start_minute, quiet_end_minute';

/** One row per branch, created by a trigger, so it always exists for a live branch. */
export function useNotificationSettings(businessId: string | null, branchId: string | null) {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: notificationKeys.detail({ businessId: businessId ?? 'none', branchId }, 'settings'),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    staleTime: staleTimes.static,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await getSupabase()
        .from('notification_settings')
        .select(SELECT)
        .eq('branch_id', branchId ?? '')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('notification settings not found');
      return {
        remindersEnabled: data.reminders_enabled,
        reminderHoursBefore: data.reminder_hours_before,
        smsEnabled: data.sms_enabled,
        reviewRequestsEnabled: data.review_requests_enabled,
        quietStartMinute: data.quiet_start_minute,
        quietEndMinute: data.quiet_end_minute,
      };
    },
  });
}

export class SaveNotificationSettingsError extends Error {}

/**
 * Updates the branch row through the table (column-level grants + the
 * `settings.booking` RLS policy are the boundary). Zero rows back means RLS said no.
 */
export function useSaveNotificationSettings(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (next: NotificationSettings) => {
      const { data, error } = await getSupabase()
        .from('notification_settings')
        .update({
          reminders_enabled: next.remindersEnabled,
          reminder_hours_before: next.reminderHoursBefore,
          sms_enabled: next.smsEnabled,
          review_requests_enabled: next.reviewRequestsEnabled,
          quiet_start_minute: next.quietStartMinute,
          quiet_end_minute: next.quietEndMinute,
        })
        .eq('branch_id', branchId ?? '')
        .select('branch_id');
      if (error) throw new SaveNotificationSettingsError(error.message);
      if (!data || data.length === 0) throw new SaveNotificationSettingsError('forbidden');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.scope({ businessId: businessId ?? 'none', branchId }),
      });
    },
  });
}
