/**
 * Country -> dialling code, for `PhoneInput`.
 *
 * Deliberately the SAME 42 countries as the dialling-code table inside the
 * `create_booking` RPC (`supabase/migrations/20261003160000_create_booking.sql`),
 * so a country picked here and a phone normalised there never disagree about
 * which code applies. If a country is added to one table it should be added to
 * the other.
 *
 * `PhoneInput` combines this with the national number to send real E.164
 * (`+<dialCode><nationalNumber>`) from the client, which makes the server's
 * `normalise_phone_e164()` a fallback rather than the primary path — it has no
 * country hint for a web caller with no device locale.
 */

export type DialCode = {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** Without the leading '+'. */
  dialCode: string;
};

export const dialCodes: readonly DialCode[] = [
  { code: 'GB', name: 'United Kingdom', dialCode: '44' },
  { code: 'US', name: 'United States', dialCode: '1' },
  { code: 'CA', name: 'Canada', dialCode: '1' },
  { code: 'PK', name: 'Pakistan', dialCode: '92' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '971' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '966' },
  { code: 'IN', name: 'India', dialCode: '91' },
  { code: 'AU', name: 'Australia', dialCode: '61' },
  { code: 'NZ', name: 'New Zealand', dialCode: '64' },
  { code: 'IE', name: 'Ireland', dialCode: '353' },
  { code: 'DE', name: 'Germany', dialCode: '49' },
  { code: 'FR', name: 'France', dialCode: '33' },
  { code: 'ES', name: 'Spain', dialCode: '34' },
  { code: 'IT', name: 'Italy', dialCode: '39' },
  { code: 'NL', name: 'Netherlands', dialCode: '31' },
  { code: 'BE', name: 'Belgium', dialCode: '32' },
  { code: 'SE', name: 'Sweden', dialCode: '46' },
  { code: 'NO', name: 'Norway', dialCode: '47' },
  { code: 'DK', name: 'Denmark', dialCode: '45' },
  { code: 'FI', name: 'Finland', dialCode: '358' },
  { code: 'PL', name: 'Poland', dialCode: '48' },
  { code: 'PT', name: 'Portugal', dialCode: '351' },
  { code: 'ZA', name: 'South Africa', dialCode: '27' },
  { code: 'NG', name: 'Nigeria', dialCode: '234' },
  { code: 'KE', name: 'Kenya', dialCode: '254' },
  { code: 'EG', name: 'Egypt', dialCode: '20' },
  { code: 'TR', name: 'Türkiye', dialCode: '90' },
  { code: 'MY', name: 'Malaysia', dialCode: '60' },
  { code: 'SG', name: 'Singapore', dialCode: '65' },
  { code: 'ID', name: 'Indonesia', dialCode: '62' },
  { code: 'PH', name: 'Philippines', dialCode: '63' },
  { code: 'TH', name: 'Thailand', dialCode: '66' },
  { code: 'BD', name: 'Bangladesh', dialCode: '880' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '94' },
  { code: 'QA', name: 'Qatar', dialCode: '974' },
  { code: 'KW', name: 'Kuwait', dialCode: '965' },
  { code: 'BH', name: 'Bahrain', dialCode: '973' },
  { code: 'OM', name: 'Oman', dialCode: '968' },
  { code: 'JO', name: 'Jordan', dialCode: '962' },
  { code: 'LB', name: 'Lebanon', dialCode: '961' },
  { code: 'MA', name: 'Morocco', dialCode: '212' },
  { code: 'TN', name: 'Tunisia', dialCode: '216' },
] as const;

export const DEFAULT_DIAL_CODE: DialCode = { code: 'GB', name: 'United Kingdom', dialCode: '44' };

export function findDialCode(code: string | null | undefined): DialCode | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  return dialCodes.find((entry) => entry.code === upper);
}
