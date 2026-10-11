import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { disablePush, enablePush, readPushState, type PushState } from '@/lib/push';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

export const pushKeys = createQueryKeys('push');

export type PushPreferences = {
  newBooking: boolean;
  pendingApproval: boolean;
  cancelled: boolean;
  reminder: boolean;
};

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  newBooking: true,
  pendingApproval: true,
  cancelled: true,
  reminder: true,
};

/** The user's own per-event switches for this business (no row = everything on). */
export function usePushPreferences(businessId: string | null) {
  const { isAuthenticated, user } = useSession();

  return useQuery({
    queryKey: pushKeys.detail({ businessId: businessId ?? 'none' }, `prefs:${user?.id ?? 'none'}`),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async (): Promise<PushPreferences> => {
      const { data, error } = await getSupabase()
        .from('push_preferences')
        .select('new_booking, pending_approval, cancelled, reminder')
        .eq('business_id', businessId ?? '')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return DEFAULT_PUSH_PREFERENCES;
      return {
        newBooking: data.new_booking,
        pendingApproval: data.pending_approval,
        cancelled: data.cancelled,
        reminder: data.reminder,
      };
    },
  });
}

const PREF_KEY: Record<keyof PushPreferences, string> = {
  newBooking: 'new_booking',
  pendingApproval: 'pending_approval',
  cancelled: 'cancelled',
  reminder: 'reminder',
};

export function useSavePushPreferences(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<PushPreferences>) => {
      const body: Record<string, boolean> = {};
      for (const key of Object.keys(patch) as (keyof PushPreferences)[]) {
        const value = patch[key];
        if (value !== undefined) body[PREF_KEY[key]] = value;
      }
      const { data, error } = await getSupabase().rpc('save_push_preferences', {
        p_business: businessId ?? '',
        p_prefs: body,
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as { ok?: boolean; code?: string };
      if (r.ok !== true) throw new Error(r.code ?? 'unknown');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: pushKeys.business(businessId ?? 'none'),
      });
    },
  });
}

/** This device's push state. Reading it never prompts. */
export function usePushDevice() {
  const { isAuthenticated, user } = useSession();

  return useQuery({
    queryKey: pushKeys.detail({ businessId: 'device' }, `device:${user?.id ?? 'none'}`),
    enabled: isAuthenticated,
    staleTime: staleTimes.liveShort,
    queryFn: async (): Promise<PushState> => {
      const { data, error } = await getSupabase().from('push_tokens').select('token');
      if (error) throw new Error(error.message);
      return readPushState((data ?? []).map((r) => r.token));
    },
  });
}

/** Enable / disable on this device. `enable` is the only call that asks for permission. */
export function usePushDeviceActions() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: [...pushKeys.all] });

  const enable = useMutation({ mutationFn: enablePush, onSuccess: refresh, onError: refresh });
  const disable = useMutation({ mutationFn: disablePush, onSuccess: refresh });
  return { enable, disable };
}
