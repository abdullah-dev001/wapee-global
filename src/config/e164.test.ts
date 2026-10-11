import { describe, expect, it } from 'vitest';

import { fromE164, toE164 } from './e164';
import {
  dialCodes,
  findDialCode,
  flagEmoji,
  searchDialCodes,
  DEFAULT_DIAL_CODE,
  type DialCode,
} from './dialCodes';

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

describe('toE164 trunk prefix', () => {
  it('drops the national trunk 0 (07700 900123 in the UK)', () => {
    expect(toE164(gb, '07700 900123')).toBe('+447700900123');
  });
  it('keeps the leading 0 for Italy, where it is part of the number', () => {
    expect(toE164(requireDialCode('IT'), '06 1234 5678')).toBe('+390612345678');
  });
});

describe('full country list', () => {
  it('covers the world, not a short list', () => {
    expect(dialCodes.length).toBeGreaterThan(220);
  });
  it('is sorted by name and has unique ISO codes', () => {
    const names = dialCodes.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(dialCodes.map((c) => c.code)).size).toBe(dialCodes.length);
  });
  it('stores E.164 for any picked country', () => {
    expect(toE164(requireDialCode('PK'), '300 1234567')).toBe('+923001234567');
    expect(toE164(requireDialCode('JP'), '90-1234-5678')).toBe('+819012345678');
  });
});

describe('searchDialCodes', () => {
  it('finds by name, case-insensitively, name-prefix first', () => {
    const names = searchDialCodes(dialCodes, 'pak').map((c) => c.code);
    expect(names[0]).toBe('PK');
  });
  it('finds by ISO code and by dial code with or without +', () => {
    expect(searchDialCodes(dialCodes, 'ae')[0]?.code).toBe('AE');
    expect(searchDialCodes(dialCodes, '+971').map((c) => c.code)).toContain('AE');
    expect(searchDialCodes(dialCodes, '971').map((c) => c.code)).toContain('AE');
  });
  it('returns everything for an empty query and nothing for nonsense', () => {
    expect(searchDialCodes(dialCodes, '')).toHaveLength(dialCodes.length);
    expect(searchDialCodes(dialCodes, 'zzzzqq')).toEqual([]);
  });
});

describe('shared dial codes', () => {
  it('keeps the picked country when the code is shared (Canada stays Canada)', () => {
    const ca = requireDialCode('CA');
    expect(fromE164('+14165550123', gb, ca).country.code).toBe('CA');
  });
  it('resolves a bare +1 number to the United States', () => {
    expect(fromE164('+14165550123', gb).country.code).toBe('US');
  });
  it('flags are regional-indicator pairs', () => {
    expect(flagEmoji('GB')).toBe('\u{1F1EC}\u{1F1E7}');
  });
});
