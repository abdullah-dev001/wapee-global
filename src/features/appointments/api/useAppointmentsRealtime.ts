import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { getSupabase } from '@/lib/supabase';

import { appointmentKeys } from './useAppointments';

let channelSequence = 0;

/**
 * Subscribes to `appointments` changes for one business and invalidates the
 * list/calendar query keys on every event — the first Realtime subscription
 * in the app (context/appointments.md: no hook pattern existed yet).
 *
 * RLS, not the `filter`, is the access boundary: Supabase applies the
 * subscriber's own Own/Branch/All policies to each change event for an
 * authenticated client (proved live with three signed-in clients — see
 * context/appointments.md "Realtime"). The `business_id` filter here only
 * narrows the WAL subscription for efficiency.
 *
 * Invalidates rather than patches the cache from the payload (CLAUDE.md §6):
 * a single INSERT/UPDATE payload does not carry the joined service/staff/
 * client names the list and calendar queries need.
 *
 * **The channel name includes a per-mount sequence number.** Today and
 * Calendar both call this hook for the same business at the same time (the
 * Tabs navigator keeps both mounted), and Supabase's client resolves
 * `.channel(name)` by NAME — a second `.on()` call against an
 * already-`subscribe()`d channel of the same name throws ("cannot add
 * postgres_changes callbacks ... after subscribe()") instead of creating an
 * independent subscription. Each hook instance needs its OWN channel;
 * invalidating the same query keys twice is harmless.
 */
export function useAppointmentsRealtime(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();
  const instanceId = useRef(++channelSequence);

  useEffect(() => {
    if (!businessId) return;

    const channel = getSupabase()
      .channel(`appointments-${businessId}-${instanceId.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: appointmentKeys.scope({ businessId, branchId }),
          });
        },
      )
      .subscribe();

    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [businessId, branchId, queryClient]);
}
