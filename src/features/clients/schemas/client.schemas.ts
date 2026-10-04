import { z } from 'zod';

/**
 * Client form. Limits mirror the CHECK constraints in
 * `20261003100000_clients_and_appointments.sql`. Phone is validated as
 * real E.164 by `PhoneInput` itself before it ever reaches this schema.
 */
export const clientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'clients.errors.nameRequired')
    .max(160, 'clients.errors.nameTooLong'),
  phoneE164: z.string().regex(/^\+[1-9][0-9]{1,14}$/, 'clients.errors.phoneInvalid'),
  email: z
    .string()
    .trim()
    .email('auth.errors.emailInvalid')
    .nullable()
    .or(z.literal('').transform(() => null)),
  notes: z.string().trim().max(5000, 'clients.errors.notesTooLong').nullable(),
});

export type ClientValues = z.infer<typeof clientSchema>;

export const emptyClient: ClientValues = {
  fullName: '',
  phoneE164: '',
  email: null,
  notes: null,
};
