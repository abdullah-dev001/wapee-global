import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { myBusinessesKey } from '@/features/onboarding/api/useBusiness';
import { invalidateMyFeatures } from '@/features/plans/api/useMyFeatures';
import { grantKeys, roleLabelKeys } from '@/lib/permissions';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';

export const claimKey = (userId: string | null) => ['members', 'claim', userId] as const;

/**
 * Joins the signed-in user to every pending "add by email" for their own VERIFIED email
 * (`claim_pending_memberships`). The database reads the email and its verification from
 * `auth.users` itself, so an unverified account joins nothing whatever the client sends.
 *
 * Runs once per user when the session is verified, again on focus/reconnect (cheap and
 * idempotent: someone already signed in may be added while the app is open; no Realtime).
 *
 * When something was joined, the query does not resolve until the membership list has been
 * REFETCHED: `AuthGate` waits on this query's first result, so it never decides "no business ->
 * onboarding" on the stale pre-join list (the 2026-10-12 routing bug class).
 *
 * Takes its inputs as arguments rather than reading the session itself, so `AuthGate` (in the
 * auth feature) can use it without an import cycle.
 */
export function useClaimPendingMemberships(input: {
  userId: string | null;
  enabled: boolean;
}): UseQueryResult<string[], Error> {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: claimKey(input.userId),
    enabled: input.enabled && input.userId !== null,
    staleTime: staleTimes.listLong,
    // A failure must not hold the gate; it is retried on the next focus instead.
    retry: false,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('claim_pending_memberships');
      const result = unwrapRpc<{ joined: string[] }>(data, error);
      const joined = Array.isArray(result.joined) ? result.joined : [];
      if (joined.length > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: myBusinessesKey }),
          // default_business_id may have just been set.
          queryClient.invalidateQueries({ queryKey: ['profile', 'me', input.userId] }),
          ...joined.flatMap((businessId) => [
            queryClient.invalidateQueries({ queryKey: grantKeys.forBusiness(businessId) }),
            queryClient.invalidateQueries({ queryKey: roleLabelKeys.forBusiness(businessId) }),
            invalidateMyFeatures(queryClient, businessId),
          ]),
        ]);
      }
      return joined;
    },
  });
}
