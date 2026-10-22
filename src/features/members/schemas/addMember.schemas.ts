import { z } from 'zod';

import { emailSchema } from '@/features/auth/schemas/auth.schemas';

/**
 * The "add someone by email" form. Messages are **i18n keys**, not sentences, so `FormField`
 * translates them and the schema can be reused server-side (CLAUDE.md §9). The email rule comes
 * from the auth schemas so there is one definition; `add_member_by_email` validates it again.
 */
export const addMemberSchema = z.object({
  email: emailSchema,
  roleId: z.string().uuid('members.errors.roleRequired'),
  /** null = every branch. */
  branchId: z.string().uuid().nullable(),
  /** An unlinked staff profile to link to the new login; null = none. */
  staffId: z.string().uuid().nullable(),
});

export type AddMemberValues = z.infer<typeof addMemberSchema>;
