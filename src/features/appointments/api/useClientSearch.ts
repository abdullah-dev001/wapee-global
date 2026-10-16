import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

export const clientSearchKeys = createQueryKeys('client-search');

export type ClientSearchResult = {
  id: string;
  fullName: string;
  /** Null without `clients.view_contact` (the database blanks it). */
  phoneE164: string | null;
  email: string | null;
};

/**
 * Server-side client search for the appointment form (name or phone).
 *
 * Not the Clients feature (out of scope this session) — a minimal read gated
 * the same way `clients_select` RLS gates it (`clients.view`), so an Own-scope
 * Staff member searching here gets exactly the rows RLS would let them see
 * (their own clients), nothing wider.
 */
export function useClientSearch(
  businessId: string | null,
  search: string,
): UseQueryResult<ClientSearchResult[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: clientSearchKeys.list({ businessId: businessId ?? 'none', search }),
    enabled: isAuthenticated && Boolean(businessId) && search.length >= 2,
    staleTime: staleTimes.list,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('clients_v')
        .select('id, full_name, phone_e164, email')
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null)
        .or(`full_name.ilike.%${search}%,phone_e164.ilike.%${search}%`)
        .order('full_name')
        .limit(20);
      if (error) throw error;
      return (data ?? []).flatMap((row) =>
        row.id && row.full_name
          ? [{ id: row.id, fullName: row.full_name, phoneE164: row.phone_e164, email: row.email }]
          : [],
      );
    },
  });
}
