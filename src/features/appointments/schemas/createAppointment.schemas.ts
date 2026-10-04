import { z } from 'zod';

/**
 * The dashboard create/walk-in appointment form. The RPC (`create_appointment`,
 * context/appointments.md) validates everything again — this only keeps the
 * form from submitting something obviously wrong.
 */
export const createAppointmentSchema = z.object({
  clientMode: z.enum(['existing', 'new']),
  clientId: z.string().uuid().nullable(),
  clientName: z.string().trim().max(160, 'appointments.errors.invalid_name').nullable(),
  clientPhone: z.string().trim().nullable(),
  clientEmail: z
    .string()
    .trim()
    .email('appointments.errors.invalid_email')
    .nullable()
    .or(z.literal('').transform(() => null)),
  serviceId: z.string().uuid({ message: 'appointments.form.service' }),
  staffId: z.string().uuid().nullable(),
  date: z.string().min(1),
  minute: z.number().int().min(0).max(1440),
  clientNotes: z.string().trim().max(2000).nullable(),
  internalNotes: z.string().trim().max(2000).nullable(),
  isWalkIn: z.boolean(),
});

export type CreateAppointmentValues = z.infer<typeof createAppointmentSchema>;

export const emptyCreateAppointment: CreateAppointmentValues = {
  clientMode: 'existing',
  clientId: null,
  clientName: null,
  clientPhone: null,
  clientEmail: null,
  serviceId: '',
  staffId: null,
  date: '',
  minute: 9 * 60,
  clientNotes: null,
  internalNotes: null,
  isWalkIn: false,
};
