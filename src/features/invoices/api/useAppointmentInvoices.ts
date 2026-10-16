import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { invoiceKeys } from './useInvoices';

/**
 * Which of these appointments already have a LIVE invoice, as `{appointmentId: invoiceId}`.
 *
 * `get_calendar_appointments` (Today/Calendar) does not return `invoice_id`, so
 * the screens ask the invoices table directly instead of changing that RPC.
 * RLS (`invoices.view`, branch scope) decides what comes back: a caller who
 * cannot see invoices gets an empty map, and the create RPC still refuses a
 * duplicate (`already_invoiced`). Invalidated by every invoice mutation
 * (`invoiceKeys.scope`), so a new/discarded draft shows up at once.
 */
export function useAppointmentInvoices(
  businessId: string | null,
  appointmentIds: readonly string[],
) {
  const { isAuthenticated } = useSession();
  const ids = [...appointmentIds].sort();

  return useQuery({
    queryKey: invoiceKeys.list({
      businessId: businessId ?? 'none',
      filters: { appointmentIds: ids },
    }),
    enabled: isAuthenticated && Boolean(businessId) && ids.length > 0,
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('invoices')
        .select('id, appointment_id')
        .eq('business_id', businessId ?? '')
        .in('appointment_id', ids)
        .is('deleted_at', null);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        if (row.appointment_id) map[row.appointment_id] = row.id;
      }
      return map;
    },
  });
}
