import { useMutation, useQueryClient } from '@tanstack/react-query';

import { myBusinessesKey } from '@/features/onboarding/api/useBusiness';
import { getSupabase } from '@/lib/supabase';
import { unwrapRpc } from '@/lib/supabase/rpcResult';

/**
 * Hides the Today setup checklist for the whole business (`dismiss_setup_checklist`; needs
 * `settings.booking`). The flag lives on the business row, so every device and teammate sees it
 * gone; the business list is refetched to carry the new value.
 */
export function useDismissSetupChecklist(businessId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<undefined, Error, undefined>({
    mutationFn: async () => {
      if (!businessId) throw new Error('No business selected');
      const { data, error } = await getSupabase().rpc('dismiss_setup_checklist', {
        p_business_id: businessId,
      });
      unwrapRpc(data, error);
      return undefined;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: myBusinessesKey });
    },
  });
}
