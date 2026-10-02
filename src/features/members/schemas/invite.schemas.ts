import { z } from 'zod';

import { emailSchema, passwordSchema } from '@/features/auth/schemas/auth.schemas';

/**
 * Invite forms. Messages are **i18n keys**, not sentences, so `FormField`
 * translates them and the schema can be reused server-side (CLAUDE.md §9).
 * Email and password rules come from the auth schemas so there is one definition.
 */

export const inviteSchema = z.object({
  email: emailSchema,
  roleId: z.string().uuid('members.errors.roleRequired'),
  /** null = every branch. */
  branchId: z.string().uuid().nullable(),
});

export type InviteValues = z.infer<typeof inviteSchema>;

/**
 * The accept screen. The invited address is fixed by the token, so only a name
 * and a password are asked for.
 */
export const acceptInviteSchema = z.object({
  fullName: z.string().trim().min(1, 'auth.errors.nameRequired').max(120),
  password: passwordSchema,
});

export type AcceptInviteValues = z.infer<typeof acceptInviteSchema>;
