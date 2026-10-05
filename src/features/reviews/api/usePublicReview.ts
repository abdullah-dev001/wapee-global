import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { callPublicFunction } from '@/features/booking-public/api/client';
import { createQueryKeys } from '@/lib/query';

import { type ReviewRequestInfo } from '../types';

export const publicReviewKeys = createQueryKeys('public-review');

/**
 * What to show a customer who opened their review link. Only the TOKEN is sent.
 * Unknown, expired, used or no-longer-completed all fail with the identical
 * `invalid_token`; the page shows one generic message for all of them.
 */
export function usePublicReviewRequest(
  token: string | null | undefined,
): UseQueryResult<ReviewRequestInfo, Error> {
  return useQuery({
    // The token is not an id we may scope by business; a plain key, as for the manage page.
    queryKey: ['public-review', token ?? 'none'],
    enabled: Boolean(token),
    staleTime: Infinity,
    retry: (failureCount, error) => {
      const code = (error as { code?: string }).code;
      if (code === 'invalid_token' || code === 'bad_request') return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const raw = await callPublicFunction<Record<string, unknown>>('get_review_request', {
        token,
      });
      return {
        businessName: String(raw.business_name ?? ''),
        branchName: String(raw.branch_name ?? ''),
        serviceName: String(raw.service_name ?? ''),
        visitDate: String(raw.visit_date ?? ''),
      };
    },
  });
}

export type SubmitReviewInput = {
  token: string;
  rating: number;
  comment: string | null;
  /** Honeypot: always empty from a person. */
  honeypot?: string;
};

/**
 * Submits the review. The response carries the branch's Google review link,
 * identical for every rating; this hook never inspects the rating to decide
 * anything about it.
 */
export function useSubmitReview() {
  return useMutation<{ googleReviewUrl: string | null }, Error, SubmitReviewInput>({
    mutationFn: async (input) => {
      const raw = await callPublicFunction<{ google_review_url?: string | null }>('submit_review', {
        token: input.token,
        rating: input.rating,
        comment: input.comment,
        ...(input.honeypot ? { company_website: input.honeypot } : {}),
      });
      return { googleReviewUrl: raw.google_review_url ?? null };
    },
  });
}
