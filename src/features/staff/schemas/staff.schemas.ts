import { z } from 'zod';

/**
 * Staff form. Messages are **i18n keys** (CLAUDE.md §9); the limits mirror the
 * CHECK constraints in `20261002181000_staff_and_schedule.sql`.
 */
export const staffSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'staff.errors.nameRequired')
    .max(120, 'staff.errors.nameTooLong'),
  jobTitle: z.string().trim().max(120, 'staff.errors.jobTitleTooLong').nullable(),
  /**
   * Optional, and NOT a login. A staff member with no app account is the normal
   * case (see context/staff.md); this is just a contact detail.
   */
  email: z
    .string()
    .trim()
    .email('auth.errors.emailInvalid')
    .nullable()
    .or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(32, 'staff.errors.phoneTooLong').nullable(),
  isActive: z.boolean(),
  isBookableOnline: z.boolean(),
  branchIds: z.array(z.string().uuid()),
  serviceIds: z.array(z.string().uuid()),
});

export type StaffValues = z.infer<typeof staffSchema>;

export const emptyStaff: StaffValues = {
  displayName: '',
  jobTitle: null,
  email: null,
  phone: null,
  isActive: true,
  isBookableOnline: true,
  branchIds: [],
  serviceIds: [],
};
