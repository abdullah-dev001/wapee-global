import { z } from 'zod';

/**
 * Service form. Messages are **i18n keys**, translated by `FormField`
 * (CLAUDE.md §9), and the limits mirror the CHECK constraints in
 * `20261002180000_catalogue.sql` so the client and the database agree.
 */

/** Matches `services_duration_range`: 5 minutes to a full day. */
export const DURATION_MIN = 5;
export const DURATION_MAX = 1440;
/** Matches `services_buffer_range`. */
export const BUFFER_MAX = 480;

export const serviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'services.errors.nameRequired')
    .max(120, 'services.errors.nameTooLong'),
  description: z.string().trim().max(2000, 'services.errors.descriptionTooLong').nullable(),
  /** null = uncategorised; categories are optional (doc §6.3). */
  categoryId: z.string().uuid().nullable(),
  durationMinutes: z
    .number()
    .int()
    .min(DURATION_MIN, 'services.errors.durationTooShort')
    .max(DURATION_MAX, 'services.errors.durationTooLong'),
  bufferMinutes: z
    .number()
    .int()
    .min(0, 'services.errors.bufferInvalid')
    .max(BUFFER_MAX, 'services.errors.bufferTooLong'),
  /**
   * Minor units at the current BRANCH, or null for "not priced yet".
   * Zero is valid (a free consultation); negative is not.
   */
  priceMinor: z.number().int().min(0, 'services.errors.priceInvalid').nullable(),
  isActive: z.boolean(),
  isBookableOnline: z.boolean(),
  staffIds: z.array(z.string().uuid()),
});

export type ServiceValues = z.infer<typeof serviceSchema>;

/** A sensible new service: 30 minutes, active, bookable, no price yet. */
export const emptyService: ServiceValues = {
  name: '',
  description: null,
  categoryId: null,
  durationMinutes: 30,
  bufferMinutes: 0,
  priceMinor: null,
  isActive: true,
  isBookableOnline: true,
  staffIds: [],
};

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'services.errors.categoryNameRequired')
    .max(80, 'services.errors.categoryNameTooLong'),
});

export type CategoryValues = z.infer<typeof categorySchema>;
