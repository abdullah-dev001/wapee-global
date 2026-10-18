import { type Database } from '@/lib/supabase/database.types';
import { type UtcIso } from '@/lib/time';

export type AppointmentStatus = Database['public']['Enums']['appointment_status'];
export type BookingSource = Database['public']['Enums']['booking_source'];

/** One row as `list_appointments` / `get_calendar_appointments` return it. */
export type AppointmentRow = {
  id: string;
  branchId: string;
  startsAt: UtcIso;
  endsAt: UtcIso;
  status: AppointmentStatus;
  source: BookingSource | null;
  serviceId: string;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  priceMinor: number | null;
  invoiceId: string | null;
};

/** Every code a write RPC can return in `{ok:false,code}` (context/appointments.md). */
export type AppointmentErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'unknown_service'
  | 'service_unavailable'
  | 'unknown_client'
  | 'invalid_name'
  | 'invalid_phone'
  | 'invalid_email'
  | 'staff_unavailable'
  | 'no_staff'
  | 'slot_unavailable'
  | 'slot_taken'
  | 'no_resource'
  | 'not_editable'
  | 'invalid_transition'
  | 'invoiced'
  | 'not_started';

export class AppointmentRpcError extends Error {
  code: AppointmentErrorCode | 'unknown';

  constructor(code: AppointmentErrorCode | 'unknown') {
    super(code);
    this.code = code;
    this.name = 'AppointmentRpcError';
  }
}

/** Throws `AppointmentRpcError` for a `{ok:false}` RPC response; returns the payload otherwise. */
export function unwrapAppointmentResult<T extends { ok: boolean; code?: string }>(result: T): T {
  if (!result.ok) {
    throw new AppointmentRpcError((result.code as AppointmentErrorCode) ?? 'unknown');
  }
  return result;
}
