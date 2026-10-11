import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { callPublicFunction } from './client';
import type { CreateBookingResult } from '../types';
import { BOT_PROTECTION_HONEYPOT_FIELD } from '../botProtection';

export type CreateBookingInput = {
  slug: string;
  /** The location being booked. Null = the server's default (the primary branch). */
  branchId?: string | null;
  serviceId: string;
  startsAt: string;
  staffId?: string | null;
  client: {
    name: string;
    /** E.164, from `PhoneInput`. */
    phone: string;
    email?: string | null;
    notes?: string | null;
  };
  answers: { customFieldId: string; value: string }[];
  /** From the most recent `get_slots` response. Re-fetch if this call fails `too_fast`/`bad_request`. */
  startToken: string;
  /** Always sent empty by a human; a bot that fills it trips the honeypot. */
  honeypotValue?: string;
};

type RawResponse = {
  appointment_id: string;
  status: 'pending' | 'confirmed';
  starts_at: string;
  ends_at: string;
  local_date: string;
  local_minute: number;
  timezone: string;
  service_name: string;
  staff_name: string | null;
  branch_name: string;
  price_minor?: number;
  currency?: string;
  manage_token: string;
};

/**
 * The public booking write, via the `create_booking` Edge Function. See
 * booking-engine.md for everything this enforces server-side (availability,
 * buffer, notice, window, capacity, answer validation) — the client sends the
 * request and interprets the structured result; it never re-implements any of
 * those rules (CLAUDE.md §6: a preview or a client must never re-derive the
 * slot engine's rules).
 *
 * No retry: a double-submit must never silently become two bookings.
 */
export function useCreateBooking(): UseMutationResult<
  CreateBookingResult,
  Error,
  CreateBookingInput
> {
  return useMutation({
    retry: false,
    mutationFn: async (input) => {
      const raw = await callPublicFunction<RawResponse>('create_booking', {
        slug: input.slug,
        ...(input.branchId ? { branch_id: input.branchId } : {}),
        service_id: input.serviceId,
        starts_at: input.startsAt,
        staff_id: input.staffId ?? undefined,
        client: {
          name: input.client.name,
          phone: input.client.phone,
          email: input.client.email ?? undefined,
          notes: input.client.notes ?? undefined,
        },
        answers: input.answers.map((a) => ({ custom_field_id: a.customFieldId, value: a.value })),
        start_token: input.startToken,
        [BOT_PROTECTION_HONEYPOT_FIELD]: input.honeypotValue ?? '',
      });

      return {
        appointmentId: raw.appointment_id,
        status: raw.status,
        startsAt: raw.starts_at,
        endsAt: raw.ends_at,
        localDate: raw.local_date,
        localMinute: raw.local_minute,
        timezone: raw.timezone,
        serviceName: raw.service_name,
        staffName: raw.staff_name,
        branchName: raw.branch_name,
        priceMinor: raw.price_minor ?? null,
        currency: raw.currency ?? null,
        manageToken: raw.manage_token,
      } satisfies CreateBookingResult;
    },
  });
}
