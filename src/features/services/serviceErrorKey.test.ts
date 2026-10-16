import { describe, expect, it } from 'vitest';

import {
  CATEGORY_ERROR_KEYS,
  SERVICE_ERROR_KEYS,
  categoryErrorKey,
  serviceErrorKey,
} from './serviceErrorKey';

function errorWithCode(code: string): Error {
  const error = new Error('raw db text') as Error & { code?: string };
  error.code = code;
  return error;
}

describe('serviceErrorKey', () => {
  it('maps 23505 (duplicate name) to duplicateName', () => {
    expect(serviceErrorKey(errorWithCode('23505'))).toBe(SERVICE_ERROR_KEYS.duplicateName);
  });

  it('maps 42501 (no permission) to forbidden', () => {
    expect(serviceErrorKey(errorWithCode('42501'))).toBe(SERVICE_ERROR_KEYS.forbidden);
  });

  it('maps 23503 (blocked by appointments/invoices) to inUse', () => {
    expect(serviceErrorKey(errorWithCode('23503'))).toBe(SERVICE_ERROR_KEYS.inUse);
  });

  it('maps 23514 (a CHECK constraint, e.g. duration/price range) to invalidInput', () => {
    expect(serviceErrorKey(errorWithCode('23514'))).toBe(SERVICE_ERROR_KEYS.invalidInput);
  });

  it('falls back to unknown for an unrecognised code or no code', () => {
    expect(serviceErrorKey(errorWithCode('99999'))).toBe(SERVICE_ERROR_KEYS.unknown);
    expect(serviceErrorKey(new Error('boom'))).toBe(SERVICE_ERROR_KEYS.unknown);
    expect(serviceErrorKey(null)).toBe(SERVICE_ERROR_KEYS.unknown);
  });
});

describe('categoryErrorKey', () => {
  it('maps 23505 (duplicate name) to duplicateName', () => {
    expect(categoryErrorKey(errorWithCode('23505'))).toBe(CATEGORY_ERROR_KEYS.duplicateName);
  });

  it('maps 42501 (no permission) to forbidden', () => {
    expect(categoryErrorKey(errorWithCode('42501'))).toBe(CATEGORY_ERROR_KEYS.forbidden);
  });

  it('maps 23514 (a CHECK constraint, e.g. name length) to invalidInput', () => {
    expect(categoryErrorKey(errorWithCode('23514'))).toBe(CATEGORY_ERROR_KEYS.invalidInput);
  });

  it('falls back to unknown for an unrecognised code or no code', () => {
    expect(categoryErrorKey(errorWithCode('99999'))).toBe(CATEGORY_ERROR_KEYS.unknown);
    expect(categoryErrorKey(new Error('boom'))).toBe(CATEGORY_ERROR_KEYS.unknown);
    expect(categoryErrorKey(null)).toBe(CATEGORY_ERROR_KEYS.unknown);
  });
});
