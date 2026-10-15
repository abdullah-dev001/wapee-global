import { describe, expect, it } from 'vitest';

import { SCHEDULE_ERROR_KEYS, resourceArchiveErrorKey, scheduleErrorKey } from './scheduleErrorKey';

function errorWithCode(code: string): Error {
  const error = new Error('raw db text') as Error & { code?: string };
  error.code = code;
  return error;
}

describe('scheduleErrorKey', () => {
  it('maps 23P01 (exclusion violation: overlap) to overlap', () => {
    expect(scheduleErrorKey(errorWithCode('23P01'))).toBe(SCHEDULE_ERROR_KEYS.overlap);
  });

  it('maps 23514 (CHECK: overnight/zero-length/invalid range) to invalidInterval', () => {
    expect(scheduleErrorKey(errorWithCode('23514'))).toBe(SCHEDULE_ERROR_KEYS.invalidInterval);
  });

  it('maps 23505 (duplicate resource name) to duplicateName', () => {
    expect(scheduleErrorKey(errorWithCode('23505'))).toBe(SCHEDULE_ERROR_KEYS.duplicateName);
  });

  it('maps 42501 (no permission) to forbidden', () => {
    expect(scheduleErrorKey(errorWithCode('42501'))).toBe(SCHEDULE_ERROR_KEYS.forbidden);
  });

  it('maps 22023 (unknown staff/branch, raised by the replace_* RPCs) to invalidInput', () => {
    expect(scheduleErrorKey(errorWithCode('22023'))).toBe(SCHEDULE_ERROR_KEYS.invalidInput);
  });

  it('falls back to unknown for an unrecognised code or no code', () => {
    expect(scheduleErrorKey(errorWithCode('99999'))).toBe(SCHEDULE_ERROR_KEYS.unknown);
    expect(scheduleErrorKey(new Error('boom'))).toBe(SCHEDULE_ERROR_KEYS.unknown);
    expect(scheduleErrorKey(null)).toBe(SCHEDULE_ERROR_KEYS.unknown);
  });
});

describe('resourceArchiveErrorKey', () => {
  it('maps future_appointments to a specific key', () => {
    expect(resourceArchiveErrorKey(errorWithCode('future_appointments'))).toBe(
      'schedule.resourceArchiveErrors.futureAppointments',
    );
  });

  it('maps not_found and forbidden', () => {
    expect(resourceArchiveErrorKey(errorWithCode('not_found'))).toBe(
      'schedule.resourceArchiveErrors.notFound',
    );
    expect(resourceArchiveErrorKey(errorWithCode('forbidden'))).toBe(
      'schedule.resourceArchiveErrors.forbidden',
    );
  });

  it('returns null for an unrecognised code or no code (caller falls back)', () => {
    expect(resourceArchiveErrorKey(errorWithCode('99999'))).toBeNull();
    expect(resourceArchiveErrorKey(new Error('boom'))).toBeNull();
    expect(resourceArchiveErrorKey(null)).toBeNull();
  });
});
