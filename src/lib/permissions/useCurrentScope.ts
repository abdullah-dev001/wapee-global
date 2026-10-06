import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';

import { useSession } from '@/features/auth';
import { useMyBusinesses, type MyBusiness } from '@/features/onboarding/api/useBusiness';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

/**
 * Which business and branch the app is currently working in.
 *
 * The selection is small client-only UI state, so it lives in Zustand
 * (CLAUDE.md §2) and never holds server data — the business and branch rows
 * themselves stay in TanStack Query. Only the two ids are stored.
 */

type ScopeSelection = {
  businessId: string | null;
  branchId: string | null;
  setBusiness: (businessId: string, branchId: string | null) => void;
  setBranch: (branchId: string | null) => void;
  clear: () => void;
};

export const useScopeSelection = create<ScopeSelection>((set) => ({
  businessId: null,
  branchId: null,
  setBusiness: (businessId, branchId) => set({ businessId, branchId }),
  setBranch: (branchId) => set({ branchId }),
  clear: () => set({ businessId: null, branchId: null }),
}));

/** The signed-in user's own profile row (for `default_business_id`, super admin). */
export function useMyProfile() {
  const { isAuthenticated, user } = useSession();

  return useQuery({
    queryKey: ['profile', 'me', user?.id ?? null],
    enabled: isAuthenticated,
    staleTime: staleTimes.static,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('id, email, full_name, is_super_admin, default_business_id, locale')
        // An aal2 super admin can read EVERY profile (RLS), so name the row.
        .eq('id', user?.id ?? '')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export type CurrentScope = {
  businessId: string | null;
  branchId: string | null;
  business: MyBusiness | null;
  /** Still resolving the membership list or the profile. */
  isPending: boolean;
};

/** The primary branch of a business, falling back to its first branch. */
function primaryBranchId(business: MyBusiness | undefined): string | null {
  if (!business) return null;
  const primary = business.branches.find((branch) => branch.is_primary);
  return primary?.id ?? business.branches[0]?.id ?? null;
}

/**
 * The current business and branch, resolved and kept in step with the data.
 *
 * On first load it picks `profiles.default_business_id`, falling back to the
 * first business the user belongs to, and the business's primary branch. If the
 * stored selection points at a business the user no longer belongs to (left,
 * disabled, deleted), it resets to that same default rather than leaving the app
 * pointed at nothing.
 *
 * There is no switcher UI yet; when one lands it calls `setBusiness`/`setBranch`.
 */
export function useCurrentScope(): CurrentScope {
  const businesses = useMyBusinesses();
  const profile = useMyProfile();
  const { businessId, branchId, setBusiness } = useScopeSelection();

  const list = businesses.data;
  const selected = list?.find((business) => business.id === businessId);
  const isPending = businesses.isPending || profile.isPending;

  useEffect(() => {
    if (!list || list.length === 0) return;
    // Already pointed at a business the user really belongs to.
    if (selected) {
      if (!branchId) useScopeSelection.getState().setBranch(primaryBranchId(selected));
      return;
    }
    const preferredId = profile.data?.default_business_id;
    const next = list.find((business) => business.id === preferredId) ?? list[0];
    if (next) setBusiness(next.id, primaryBranchId(next));
  }, [list, selected, branchId, profile.data?.default_business_id, setBusiness]);

  return {
    businessId: selected?.id ?? null,
    branchId: selected ? branchId : null,
    business: selected ?? null,
    isPending,
  };
}
