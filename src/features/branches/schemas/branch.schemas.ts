import { z } from 'zod';

import { isValidPrefix, parsePercentToBp } from '../branchLogic';

/**
 * Branch form validation. The database validates everything again
 * (`create_branch` / `update_branch`); this gives a fast, friendly answer.
 */
export const branchFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'branches.errors.invalid_name')
    .max(120, 'branches.errors.invalid_name'),
  countryCode: z.string().length(2, 'branches.errors.invalid_country'),
  currency: z.string().length(3, 'branches.errors.invalid_currency'),
  timezone: z.string().min(1, 'branches.errors.invalid_timezone'),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  taxNumber: z.string().trim().max(60),
  taxRatePercent: z
    .string()
    .refine((value) => parsePercentToBp(value) !== null, 'branches.errors.invalid_tax_rate'),
  invoicePrefix: z
    .string()
    .trim()
    .refine((value) => value === '' || isValidPrefix(value), 'branches.errors.invalid_prefix'),
});

export type BranchFormSchemaValues = z.infer<typeof branchFormSchema>;
