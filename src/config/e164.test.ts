import { describe, expect, it } from 'vitest';

import { fromE164, toE164 } from './e164';
import { findDialCode, DEFAULT_DIAL_CODE, type DialCode } from './dialCodes';

function requireDialCode(code: string): DialCode {
  const found = findDialCode(code);
  if (!found) throw new Error(`Test fixture problem: no dial code for ${code}`);
  return found;
}

const gb = requireDialCode('GB');
const us = requireDialCode('US');
const ae = requireDialCode('AE');

describe('toE164', () => {
  it('combines a country and national digits', () => {
    expect(toE164(gb, '7700900123')).toBe('+447700900123');
  });

  it('strips non-digit characters from the national number', () => {
    expect(toE164(gb, '7700 900 123')).toBe('+447700900123');
    expect(toE164(us, '(555) 123-4567')).toBe('+15551234567');
  });

  it('returns an empty string when there are no digits', () => {
    expect(toE164(gb, '')).toBe('');
    expect(toE164(gb, '   ')).toBe('');
  });
});

describe('fromE164', () => {
  it('splits a known dial code and its national digits', () => {
    expect(fromE164('+447700900123', DEFAULT_DIAL_CODE)).toEqual({
      country: gb,
      nationalNumber: '7700900123',
    });
  });

  it('prefers the LONGEST matching dial code (1 must not shadow 971)', () => {
    expect(fromE164('+971501234567', DEFAULT_DIAL_CODE)).toEqual({
      country: ae,
      nationalNumber: '501234567',
    });
  });

  it('falls back to the given default when no dial code matches', () => {
    expect(fromE164('+999123456', gb)).toEqual({ country: gb, nationalNumber: '999123456' });
  });

  it('treats a value with no leading + as a raw national number', () => {
    expect(fromE164('7700900123', gb)).toEqual({ country: gb, nationalNumber: '7700900123' });
  });

  it('round-trips through toE164', () => {
    const { country, nationalNumber } = fromE164('+15551234567', DEFAULT_DIAL_CODE);
    expect(toE164(country, nationalNumber)).toBe('+15551234567');
  });
});
