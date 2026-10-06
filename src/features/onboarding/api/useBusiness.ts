import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { type Database } from '@/lib/supabase/database.types';

import { type OnboardingValues } from '../schemas/onboarding.schemas';

type BusinessRow = Database['public']['Tables']['businesses']['Row'];
type BranchRow = Database['public']['Tables']['branches']['Row'];

export const businessKeys = createQueryKeys('businesses');

/** Keys for the "which businesses am I in" lookup, which has no business scope yet. */
const myBusinessesKey = ['businesses', 'mine'] as const;

/**
 * A business the user belongs to, with its primary branch.
 *
 * Country, currency and timezone belong to the BRANCH (product doc decision 23),
 * so they are read from there and never from the business. The business keeps
 * `default_*` copies only to pre-fill a new branch.
 */
export type MyBusiness = Pick<
  BusinessRow,
  'id' | 'name' | 'slug' | 'status' | 'plan' | 'trial_ends_at' | 'language'
> & {
  branches: Pick<
    BranchRow,
    'id' | 'name' | 'is_primary' | 'country_code' | 'currency' | 'timezone' | 'invoice_prefix'
  >[];
};

/**
 * Every business the signed-in user is an active member of.
 * RLS already limits the rows, so no explicit filter is needed here.
 */
export function useMyBusinesses(): UseQueryResult<MyBusiness[], Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: myBusinessesKey,
    enabled: isAuthenticated,
    // Status and trial dates decide whether the app is locked, so keep this fresh.
    staleTime: staleTimes.list,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('businesses')
        .select(
          'id, name, slug, status, plan, trial_ends_at, language, branches(id, name, is_primary, country_code, currency, timezone, invoice_prefix, deleted_at)',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      // An archived location is not a place to work in: every branch picker and the
      // current-scope default read this list, so drop archived ones here, once.
      return (data ?? []).map((business) => ({
        ...business,
        branches: (business.branches ?? [])
          .filter((branch) => branch.deleted_at === null)
          .map(({ deleted_at: _deletedAt, ...branch }) => branch),
      }));
    },
  });
}

/** Live slug availability for the onboarding form (format + reserved + taken). */
export function useSlugAvailable(slug: string, enabled: boolean): UseQueryResult<boolean, Error> {
  return useQuery({
    queryKey: ['slug-available', slug],
    enabled: enabled && slug.length >= 3,
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('is_slug_available', { p_slug: slug });
      if (error) throw new Error(error.message);
      return data === true;
    },
  });
}

/**
 * Creates the business, its first branch, the Owner membership and the 14-day
 * trial in one database transaction (`create_business_with_owner`). Either the
 * whole thing exists or none of it does.
 */
export function useCreateBusiness() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, OnboardingValues>({
    mutationFn: async (values) => {
      const { data, error } = await getSupabase().rpc('create_business_with_owner', {
        p_name: values.name,
        p_slug: values.slug,
        p_country_code: values.countryCode,
        p_currency: values.currency,
        p_timezone: values.timezone,
        p_language: values.language,
        p_industry: values.industry ?? undefined,
        p_branch_name: values.branchName ?? undefined,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Business was not created');
      return data;
    },
    onSuccess: () => {
      // The gate reads this list to decide between onboarding and the app.
      void queryClient.invalidateQueries({ queryKey: myBusinessesKey });
    },
  });
}
