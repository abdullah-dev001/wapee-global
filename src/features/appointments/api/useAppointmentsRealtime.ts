import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getSupabase } from '@/lib/supabase';

import { appointmentKeys } from './useAppointments';

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
 */
export function useAppointmentsRealtime(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!businessId) return;

    const channel = getSupabase()
      .channel(`appointments-${businessId}`)
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
