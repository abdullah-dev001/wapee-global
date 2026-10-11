/** Review UI helpers. PURE. */

import { isRating } from '@/components/shared/starFlags';

import { type ReviewListFilters } from './types';

export { isRating, starFlags } from '@/components/shared/starFlags';

export const MAX_COMMENT_LENGTH = 2000;
export const MAX_REPLY_LENGTH = 1000;

/** The reply to send: trimmed, or null when blank or too long. */
export function cleanReply(input: string): string | null {
  const text = input.trim();
  return text.length > 0 && text.length <= MAX_REPLY_LENGTH ? text : null;
}

/** Comment as the customer typed it: trimmed, empty -> null, null when too long. */
export function cleanComment(input: string): { ok: true; value: string | null } | { ok: false } {
  const text = input.trim();
  if (text.length > MAX_COMMENT_LENGTH) return { ok: false };
  return { ok: true, value: text.length > 0 ? text : null };
}

/** Search params -> list filters (unknown values are ignored). */
export function filtersFromParams(params: {
  rating?: string;
  replied?: string;
  featured?: string;
  branch?: string;
}): ReviewListFilters {
  const rating = Number(params.rating);
  return {
    branchId: params.branch && params.branch !== 'all' ? params.branch : null,
    rating: isRating(rating) ? rating : null,
    hasReply: params.replied === 'yes' ? true : params.replied === 'no' ? false : null,
    featured: params.featured === 'yes' ? true : params.featured === 'no' ? false : null,
  };
}

export function isFiltered(filters: ReviewListFilters): boolean {
  return filters.rating !== null || filters.hasReply !== null || filters.featured !== null;
}

/** Whether a completed appointment may offer "get review link again". */
export function canOfferReviewLink(input: {
  status: string;
  hasReview: boolean;
  allowed: boolean;
}): boolean {
  return input.allowed && input.status === 'completed' && !input.hasReview;
}
