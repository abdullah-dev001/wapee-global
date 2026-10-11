import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { callPublicFunction } from '@/features/booking-public/api/client';
import { createQueryKeys, staleTimes } from '@/lib/query';

import { mapWebsite } from '../mapWebsite';
import { type WebsiteModel } from '../types';

export const publicWebsiteKeys = createQueryKeys('public-website');

/**
 * The public website for a slug, from the `get_website` Edge Function only (the
 * publishable key; no table access). A slug that is unknown, unpublished or
 * inactive fails with the one generic `not_found`.
 */
export function usePublicWebsite(slug: string | undefined): UseQueryResult<WebsiteModel, Error> {
  return useQuery({
    queryKey: publicWebsiteKeys.detail({ businessId: slug ?? 'none' }, slug ?? 'none'),
    enabled: Boolean(slug),
    staleTime: staleTimes.static,
    retry: (failureCount, error) => {
      const code = (error as { code?: string }).code;
      if (code === 'not_found' || code === 'bad_request') return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const raw = await callPublicFunction<Record<string, unknown>>('get_website', { slug });
      return mapWebsite(raw);
    },
  });
}
