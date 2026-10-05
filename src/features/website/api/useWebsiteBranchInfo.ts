import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import { type WebsiteHour } from '../types';

export const websiteBranchKeys = createQueryKeys('website-branch-info');

export type WebsiteBranchInfo = {
  name: string;
  address: string | null;
  phone: string | null;
  countryCode: string | null;
  currency: string;
  hours: WebsiteHour[];
};

/** The website branch's address, phone and opening hours, for the editor preview (members can read them). */
export function useWebsiteBranchInfo(
  businessId: string | null,
  branchId: string | null,
): UseQueryResult<WebsiteBranchInfo, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: websiteBranchKeys.detail({ businessId: businessId ?? 'none' }, branchId ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId && branchId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const supabase = getSupabase();
      const [branch, hours] = await Promise.all([
        supabase
          .from('branches')
          .select('name, address, phone, country_code, currency')
          .eq('id', branchId ?? '')
          .single(),
        supabase
          .from('branch_hours')
          .select('day_of_week, start_minute, end_minute')
          .eq('branch_id', branchId ?? '')
          .order('day_of_week')
          .order('start_minute'),
      ]);
      if (branch.error) throw new Error(branch.error.message);
      if (hours.error) throw new Error(hours.error.message);
      return {
        name: branch.data.name,
        address: branch.data.address,
        phone: branch.data.phone,
        countryCode: branch.data.country_code,
        currency: branch.data.currency,
        hours: hours.data.map((h) => ({
          dayOfWeek: h.day_of_week,
          startMinute: h.start_minute,
          endMinute: h.end_minute,
        })),
      };
    },
  });
}
