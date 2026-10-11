import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { createQueryKeys } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { useDisabledNotice } from '../accountDisabled';
import { useSession } from '../SessionProvider';

export const accessKeys = createQueryKeys('access');

/**
 * Second layer behind the Auth hook: while signed in, asks the database whether this
 * account is disabled (every business suspended). On app focus / reconnect the query
 * refetches (no Realtime), and a disabled answer ends the local session at once.
 * `scope: 'local'` because the server already deleted the sessions.
 */
export function useAccessGuard(): void {
  const { isAuthenticated, user } = useSession();
  const showNotice = useDisabledNotice((s) => s.show);

  const check = useQuery({
    queryKey: accessKeys.detail({ businessId: 'self' }, `state:${user?.id ?? 'none'}`),
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getSupabase().rpc('my_access_state');
      if (error) throw new Error(error.message);
      return (data as { disabled?: boolean } | null)?.disabled === true;
    },
  });

  const disabled = check.data === true;
  useEffect(() => {
    if (!disabled) return;
    showNotice();
    void getSupabase().auth.signOut({ scope: 'local' });
  }, [disabled, showNotice]);
}
