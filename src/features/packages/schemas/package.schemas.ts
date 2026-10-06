import { z } from 'zod';

/** Error messages are i18n KEYS (translated by `FormField`), never display text. */
export const packageSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'packages.errors.invalid_name')
    .max(120, 'packages.errors.invalid_name'),
  description: z.string().trim().max(1000, 'packages.errors.invalid_description'),
  sessions: z
    .number('packages.errors.invalid_sessions')
    .int('packages.errors.invalid_sessions')
    .min(1, 'packages.errors.invalid_sessions')
    .max(999, 'packages.errors.invalid_sessions'),
  bonusSessions: z
    .number('packages.errors.invalid_bonus')
    .int('packages.errors.invalid_bonus')
    .min(0, 'packages.errors.invalid_bonus')
    .max(999, 'packages.errors.invalid_bonus'),
  priceMinor: z
    .number('packages.errors.invalid_price')
    .int('packages.errors.invalid_price')
    .min(0, 'packages.errors.invalid_price')
    .max(100_000_000_000, 'packages.errors.invalid_price'),
  expiryDays: z
    .number('packages.errors.invalid_expiry')
    .int('packages.errors.invalid_expiry')
    .min(1, 'packages.errors.invalid_expiry')
    .max(3650, 'packages.errors.invalid_expiry')
    .nullable(),
  serviceIds: z.array(z.string()).min(1, 'packages.errors.services_required'),
  isActive: z.boolean(),
});

export type PackageValues = z.infer<typeof packageSchema>;

export const emptyPackage: PackageValues = {
  name: '',
  description: '',
  sessions: 5,
  bonusSessions: 0,
  priceMinor: 0,
  expiryDays: null,
  serviceIds: [],
  isActive: true,
};
