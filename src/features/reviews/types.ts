export type ReviewListFilters = {
  branchId: string | null;
  rating: number | null;
  hasReply: boolean | null;
  featured: boolean | null;
};

export type ReviewItem = {
  id: string;
  branchId: string;
  appointmentId: string;
  rating: number;
  comment: string | null;
  reviewerFirstName: string;
  status: 'published' | 'removed';
  ownerReply: string | null;
  repliedAt: string | null;
  featuredOnWebsite: boolean;
  createdAt: string;
};

export type ReviewCursor = { createdAt: string; id: string };

/** Codes the review RPCs return that the UI has a message for. */
export type ReviewErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'invalid_reply'
  | 'too_many_featured'
  | 'not_completed'
  | 'already_reviewed'
  | 'bad_request'
  | 'unknown';

export class ReviewRpcError extends Error {
  readonly code: ReviewErrorCode;
  constructor(code: string) {
    super(code);
    this.name = 'ReviewRpcError';
    const known: readonly string[] = [
      'forbidden',
      'not_found',
      'invalid_reply',
      'too_many_featured',
      'not_completed',
      'already_reviewed',
      'bad_request',
    ];
    this.code = known.includes(code) ? (code as ReviewErrorCode) : 'unknown';
  }
}

/** Publicly visible outcome states of the review page. */
export type ReviewRequestInfo = {
  businessName: string;
  branchName: string;
  serviceName: string;
  visitDate: string;
};
