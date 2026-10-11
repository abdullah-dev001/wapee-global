import { z } from 'zod';

import type { PublicFormFieldSnapshot } from '../types';

/**
 * The customer-facing booking form: the fixed default fields (doc §6.1) plus
 * whichever custom fields apply to the chosen service. Built dynamically per
 * service because a field scoped to "selected services" must not appear (or be
 * required) for a service it does not apply to.
 *
 * Mirrors the server's own validation in `create_booking` (booking-engine.md)
 * so the customer sees the same rule before submitting that the RPC will
 * enforce after — but the RPC is always the authority; this only avoids a
 * round trip for the common mistakes.
 */
export function buildBookingFormSchema(
  fieldsForService: readonly PublicFormFieldSnapshot[],
  requireClientEmail: boolean,
) {
  const shape: Record<string, z.ZodTypeAny> = {
    name: z
      .string()
      .trim()
      .min(1, 'bookingPublic.form.errors.nameRequired')
      .max(160, 'bookingPublic.form.errors.nameTooLong'),
    // E.164, produced by PhoneInput. The regex mirrors the DB's
    // clients_phone_e164_format constraint.
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9][0-9]{1,14}$/, 'bookingPublic.form.errors.phoneRequired'),
    email: requireClientEmail
      ? z.string().trim().min(1, 'bookingPublic.form.errors.emailRequired').email({
          message: 'bookingPublic.form.errors.emailInvalid',
        })
      : z
          .string()
          .trim()
          .email('bookingPublic.form.errors.emailInvalid')
          .optional()
          .or(z.literal('')),
    notes: z.string().trim().max(2000, 'bookingPublic.form.errors.notesTooLong').optional(),
  };

  for (const field of fieldsForService) {
    const key = `custom_${field.id}`;
    shape[key] = fieldValidator(field);
  }

  return z.object(shape);
}

function fieldValidator(field: PublicFormFieldSnapshot): z.ZodTypeAny {
  const required = field.isRequired;

  switch (field.fieldType) {
    case 'number': {
      const base = z
        .string()
        .trim()
        .regex(/^-?[0-9]+(\.[0-9]+)?$/, 'bookingPublic.form.errors.numberInvalid');
      return required
        ? base.min(1, 'bookingPublic.form.errors.required')
        : z.union([base, z.literal('')]);
    }
    case 'yes_no': {
      const base = z.enum(['true', 'false']);
      return required ? base : base.optional().or(z.literal(''));
    }
    case 'dropdown': {
      const options = (field.options ?? []) as [string, ...string[]];
      const base = options.length > 0 ? z.enum(options) : z.string();
      return required ? base : base.optional().or(z.literal(''));
    }
    case 'long_text':
    case 'short_text':
    default: {
      const maxLen = field.fieldType === 'short_text' ? 500 : 4000;
      const base = z.string().trim().max(maxLen, 'bookingPublic.form.errors.textTooLong');
      return required ? base.min(1, 'bookingPublic.form.errors.required') : base.optional();
    }
  }
}

export type BookingFormValues = Record<string, string | undefined>;
