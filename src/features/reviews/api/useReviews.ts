import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { appointmentKeys } from '@/features/appointments/api/useAppointments';
import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';

import {
  ReviewRpcError,
  type ReviewCursor,
  type ReviewItem,
  type ReviewListFilters,
} from '../types';

export const reviewKeys = createQueryKeys('reviews');

type Raw = Record<string, unknown>;

function unwrap(data: unknown, error: { message: string } | null): Raw {
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as Raw;
  if (result.ok === false) throw new ReviewRpcError(String(result.code ?? 'unknown'));
  return result;
}

function mapReview(raw: Raw): ReviewItem {
  return {
    id: String(raw.id),
    branchId: String(raw.branch_id),
    appointmentId: String(raw.appointment_id),
    rating: Number(raw.rating),
    comment: typeof raw.comment === 'string' ? raw.comment : null,
    reviewerFirstName: String(raw.reviewer_first_name ?? ''),
    status: raw.status === 'removed' ? 'removed' : 'published',
    ownerReply: typeof raw.owner_reply === 'string' ? raw.owner_reply : null,
    repliedAt: typeof raw.replied_at === 'string' ? raw.replied_at : null,
    featuredOnWebsite: raw.featured_on_website === true,
    createdAt: String(raw.created_at),
  };
}

type ReviewPage = { items: ReviewItem[]; nextCursor: ReviewCursor | null };

/** `list_reviews`: keyset pagination, server-side filters. RLS narrows Staff to their own. */
export function useReviewList(businessId: string | null, filters: ReviewListFilters) {
  const { isAuthenticated } = useSession();
  const { branchId, rating, hasReply, featured } = filters;

  return useInfiniteQuery<ReviewPage>({
    queryKey: reviewKeys.list({
      businessId: businessId ?? 'none',
      branchId,
      filters: { rating, hasReply, featured },
    }),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.liveShort,
    initialPageParam: null as ReviewCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as ReviewCursor | null;
      const { data, error } = await getSupabase().rpc('list_reviews', {
        p_business_id: businessId ?? '',
        p_branch_id: branchId ?? undefined,
        p_rating: rating ?? undefined,
        p_has_reply: hasReply ?? undefined,
        p_featured: featured ?? undefined,
        p_limit: 20,
        p_cursor_created_at: cursor?.createdAt,
        p_cursor_id: cursor?.id,
      });
      if (error) throw new Error(error.message);
      const result = (data ?? {}) as Raw;
      const items = ((result.items as Raw[] | undefined) ?? []).map(mapReview);
      const next = result.next_cursor as { created_at?: string; id?: string } | null | undefined;
      return {
        items,
        nextCursor:
          next?.created_at && next.id ? { createdAt: next.created_at, id: next.id } : null,
      };
    },
  });
}

/** Whether an appointment already has a review (RLS-scoped read), for the review-link action. */
export function useAppointmentHasReview(
  businessId: string | null,
  appointmentId: string | null,
  enabled: boolean,
): UseQueryResult<boolean, Error> {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: reviewKeys.detail(
      { businessId: businessId ?? 'none' },
      `appt:${appointmentId ?? 'none'}`,
    ),
    enabled: enabled && isAuthenticated && Boolean(businessId && appointmentId),
    staleTime: staleTimes.liveShort,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('reviews')
        .select('id')
        .eq('appointment_id', appointmentId ?? '')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data !== null;
    },
  });
}

function useInvalidate(businessId: string | null) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      queryKey: reviewKeys.business(businessId ?? 'none'),
    });
}

export function useReplyToReview(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, { reviewId: string; reply: string }>({
    mutationFn: async ({ reviewId, reply }) => {
      const { data, error } = await getSupabase().rpc('reply_to_review', {
        p_review_id: reviewId,
        p_reply: reply,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

export function useSetReviewFeatured(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, { reviewId: string; featured: boolean }>({
    mutationFn: async ({ reviewId, featured }) => {
      const { data, error } = await getSupabase().rpc('set_review_featured', {
        p_review_id: reviewId,
        p_featured: featured,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

export type ReviewLink = { token: string; expiresAt: string };

/** Rotates the review link; the OLD link stops working. Returns the new raw token once. */
export function useReissueReviewLink(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<ReviewLink, Error, { appointmentId: string }>({
    mutationFn: async ({ appointmentId }) => {
      const { data, error } = await getSupabase().rpc('reissue_review_request', {
        p_appointment_id: appointmentId,
      });
      const result = unwrap(data, error);
      const request = (result.review_request ?? {}) as Raw;
      return { token: String(request.token), expiresAt: String(request.expires_at) };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: appointmentKeys.business(businessId ?? 'none'),
      });
    },
  });
}
