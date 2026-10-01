import { z } from 'zod';

import {
  isReservedSlug,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
} from '@/config/reservedSlugs';

/**
 * Onboarding validation. The database enforces all of this again
 * (CHECK constraints, the reserved-slug trigger and `is_slug_available`);
 * this layer only gives a fast, friendly answer in the form.
 */

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN_LENGTH, 'onboarding.errors.slugTooShort')
  .max(SLUG_MAX_LENGTH, 'onboarding.errors.slugTooLong')
  .regex(SLUG_PATTERN, 'onboarding.errors.slugFormat')
  .refine((value) => !isReservedSlug(value), 'onboarding.errors.slugReserved');

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'onboarding.errors.nameRequired').max(120),
  slug: slugSchema,
  industry: z.string().trim().max(60).optional(),
  countryCode: z.string().length(2, 'onboarding.errors.countryRequired'),
  currency: z.string().length(3, 'onboarding.errors.currencyRequired'),
  timezone: z.string().min(1, 'onboarding.errors.timezoneRequired'),
  // No .default() here: it would make the zod input and output types differ,
  // which breaks the react-hook-form resolver's generics. The form supplies 'en'.
  language: z.string().min(2),
  branchName: z.string().trim().max(120).optional(),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;

/** Turns a business name into a slug suggestion. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      // Strip accents so "Café" becomes "cafe" rather than losing the letter.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX_LENGTH)
  );
}
