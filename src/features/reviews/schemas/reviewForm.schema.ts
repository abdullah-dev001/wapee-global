import { z } from 'zod';

import { MAX_COMMENT_LENGTH } from '../reviewLogic';

/** The customer's review form. The server validates again (`submit_review`). */
export const reviewFormSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, 'reviewPage.errors.ratingRequired')
    .max(5, 'reviewPage.errors.ratingRequired'),
  comment: z.string().max(MAX_COMMENT_LENGTH, 'reviewPage.errors.commentTooLong'),
});

export type ReviewFormValues = z.infer<typeof reviewFormSchema>;
