/**
 * Pure E.164 composition/decomposition for `PhoneInput`, split out so it can be
 * unit-tested without a renderer (CLAUDE.md §10a).
 */
import { canonicalDialCountry, dialCodes, type DialCode } from './dialCodes';

/** Italy keeps its leading 0 as part of the number; everywhere else it is the trunk prefix. */
const KEEPS_LEADING_ZERO = new Set(['39']);

/** country + national digits -> "+<dialCode><digits>", or "" if no digits. */
export function toE164(country: DialCode, nationalNumber: string): string {
  let digits = nationalNumber.replace(/[^0-9]/g, '');
  // "07700 900123" is the national form of "+44 7700 900123": drop the trunk 0.
  if (!KEEPS_LEADING_ZERO.has(country.dialCode)) digits = digits.replace(/^0+/, '');
  return digits ? `+${country.dialCode}${digits}` : '';
}

/**
 * "+<dialCode><digits>" -> the matching country and the national digits.
 * `preferred` wins when its dial code matches (so a picked "Canada" stays Canada
 * although +1 is shared); otherwise the longest matching code, then the canonical
 * country for it. Falls back to `fallback` when no dial code matches.
 */
export function fromE164(
  value: string,
  fallback: DialCode,
  preferred?: DialCode,
): { country: DialCode; nationalNumber: string } {
  if (!value.startsWith('+')) {
    return { country: fallback, nationalNumber: value.replace(/^\+/, '') };
  }
  const digits = value.slice(1);
  if (preferred && digits.startsWith(preferred.dialCode)) {
    return { country: preferred, nationalNumber: digits.slice(preferred.dialCode.length) };
  }
  // Longest dial code first, so "1" does not shadow "971" etc.
  const lengths = [...new Set(dialCodes.map((c) => c.dialCode.length))].sort((a, b) => b - a);
  for (const length of lengths) {
    const match = canonicalDialCountry(digits.slice(0, length));
    if (match && match.dialCode.length === length) {
      return { country: match, nationalNumber: digits.slice(length) };
    }
  }
  return { country: fallback, nationalNumber: digits };
}
