import { z } from 'zod';

/**
 * Validation for every auth form. The same schema drives react-hook-form and,
 * where it matters, is re-checked by Postgres constraints or Supabase itself.
 */

/** Supabase's own minimum is 6; 8 is a reasonable floor for a business account. */
export const PASSWORD_MIN_LENGTH = 8;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'auth.errors.emailRequired')
  .email('auth.errors.emailInvalid')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'auth.errors.passwordTooShort')
  // Supabase rejects anything over 72 bytes (bcrypt limit).
  .max(72, 'auth.errors.passwordTooLong');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'auth.errors.passwordRequired'),
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(1, 'auth.errors.nameRequired').max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'auth.errors.passwordsDoNotMatch',
    path: ['confirmPassword'],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
