/**
 * Pure E.164 composition/decomposition for `PhoneInput`, split out so it can be
 * unit-tested without a renderer (CLAUDE.md §10a).
 */
import { dialCodes, type DialCode } from './dialCodes';

/** country + national digits -> "+<dialCode><digits>", or "" if no digits. */
export function toE164(country: DialCode, nationalNumber: string): string {
  const digits = nationalNumber.replace(/[^0-9]/g, '');
  return digits ? `+${country.dialCode}${digits}` : '';
}

/**
 * "+<dialCode><digits>" -> the matching country and the national digits.
 * Falls back to `fallback` and treats the whole value as national digits when
 * no known dial code matches (e.g. the value is empty, or from a country not
 * in `dialCodes`).
 */
export function fromE164(
  value: string,
  fallback: DialCode,
): { country: DialCode; nationalNumber: string } {
  if (!value.startsWith('+')) {
    return { country: fallback, nationalNumber: value.replace(/^\+/, '') };
  }
  const digits = value.slice(1);
  // Longest dial code first, so "1" (US/CA) does not shadow "971" (UAE) etc.
  const candidates = [...dialCodes].sort((a, b) => b.dialCode.length - a.dialCode.length);
  const match = candidates.find((c) => digits.startsWith(c.dialCode));
  if (!match) return { country: fallback, nationalNumber: digits };
  return { country: match, nationalNumber: digits.slice(match.dialCode.length) };
}
