import { z } from 'zod';

import { emailSchema, passwordSchema } from '@/features/auth/schemas/auth.schemas';

/** Same rules as sign-up for the new password (8-72); the current one only has to be present. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'auth.errors.passwordRequired'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'auth.errors.passwordsDoNotMatch',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'account.errors.same_password',
    path: ['newPassword'],
  });

export const changeEmailSchema = z.object({
  newEmail: emailSchema,
  currentPassword: z.string().min(1, 'auth.errors.passwordRequired'),
});

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
export type ChangeEmailValues = z.infer<typeof changeEmailSchema>;
