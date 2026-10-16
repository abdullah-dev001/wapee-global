import { describe, expect, it } from 'vitest';

import common from '@/lib/i18n/locales/en/common.json';

import { appointmentErrorKey } from './appointmentErrorKey';
import { AppointmentRpcError } from './types';

function hasKey(key: string): boolean {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      common,
    );
  return typeof value === 'string' && value.length > 0;
}

describe('appointmentErrorKey', () => {
  it('maps an RPC {ok:false} code to its own message', () => {
    expect(appointmentErrorKey(new AppointmentRpcError('slot_unavailable'))).toBe(
      'appointments.errors.slot_unavailable',
    );
    expect(appointmentErrorKey(new AppointmentRpcError('not_editable'))).toBe(
      'appointments.errors.not_editable',
    );
  });

  it('falls back for an unknown RPC code', () => {
    expect(appointmentErrorKey(new AppointmentRpcError('unknown'))).toBe(
      'appointments.errors.unknown',
    );
  });

  it('maps Postgres SQLSTATEs, never the message', () => {
    expect(appointmentErrorKey({ code: '42501', message: 'permission denied for table x' })).toBe(
      'appointments.errors.forbidden',
    );
    expect(appointmentErrorKey({ code: '23P01', message: 'conflicting key value' })).toBe(
      'appointments.errors.slot_unavailable',
    );
    expect(appointmentErrorKey(new Error('Failed to fetch'))).toBe('appointments.errors.unknown');
    expect(appointmentErrorKey(null)).toBe('appointments.errors.unknown');
  });

  it('every key it can return exists in the English catalogue', () => {
    const codes = [
      'forbidden',
      'not_found',
      'unknown_service',
      'service_unavailable',
      'unknown_client',
      'invalid_name',
      'invalid_phone',
      'invalid_email',
      'staff_unavailable',
      'no_staff',
      'slot_unavailable',
      'slot_taken',
      'no_resource',
      'not_editable',
      'invalid_transition',
      'invoiced',
      'unknown',
    ] as const;
    for (const code of codes) {
      expect(hasKey(appointmentErrorKey(new AppointmentRpcError(code)))).toBe(true);
    }
  });
});
