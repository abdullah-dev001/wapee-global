/**
 * Currency + timezone DEFAULTS for common countries. This table only pre-fills
 * the onboarding form.
 *
 * It does **not** limit what can be chosen: the selects are populated from
 * `localeData.generated.ts` (280 countries, 162 currencies, 418 timezones).
 * A country missing from this table simply gets no pre-fill, and the owner
 * picks currency and timezone themselves.
 *
 * Why static data at all: **Hermes has no `Intl.Locale` and no
 * `Intl.supportedValuesOf`** — both are `undefined` on device, though they work
 * in Node and browsers (verified on the iOS simulator). The generated file is
 * snapshotted from Node's ICU at build time.
 *
 * Countries spanning several timezones list their most populous one as the
 * default and their main zones in `timezones`, which the form offers first.
 */

import { allTimezones } from './localeData.generated';

export type Country = {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** ISO 4217 default. */
  currency: string;
  /** IANA default (the most populous zone for multi-zone countries). */
  timezone: string;
  /**
   * Main zones for a country that spans several. The form lists these first,
   * with every other IANA zone still available below.
   */
  timezones?: readonly string[];
};

export const countries: readonly Country[] = [
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', timezone: 'Asia/Dubai' },
  {
    code: 'AU',
    name: 'Australia',
    currency: 'AUD',
    timezone: 'Australia/Sydney',
    timezones: [
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Brisbane',
      'Australia/Adelaide',
      'Australia/Perth',
      'Australia/Hobart',
      'Australia/Darwin',
    ],
  },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', timezone: 'Asia/Dhaka' },
  { code: 'BE', name: 'Belgium', currency: 'EUR', timezone: 'Europe/Brussels' },
  {
    code: 'BR',
    name: 'Brazil',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    timezones: [
      'America/Sao_Paulo',
      'America/Bahia',
      'America/Fortaleza',
      'America/Manaus',
      'America/Recife',
      'America/Rio_Branco',
    ],
  },
  {
    code: 'CA',
    name: 'Canada',
    currency: 'CAD',
    timezone: 'America/Toronto',
    timezones: [
      'America/Toronto',
      'America/Vancouver',
      'America/Edmonton',
      'America/Winnipeg',
      'America/Halifax',
      'America/St_Johns',
      'America/Regina',
    ],
  },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', timezone: 'Europe/Zurich' },
  { code: 'DE', name: 'Germany', currency: 'EUR', timezone: 'Europe/Berlin' },
  { code: 'DK', name: 'Denmark', currency: 'DKK', timezone: 'Europe/Copenhagen' },
  { code: 'EG', name: 'Egypt', currency: 'EGP', timezone: 'Africa/Cairo' },
  { code: 'ES', name: 'Spain', currency: 'EUR', timezone: 'Europe/Madrid' },
  { code: 'FR', name: 'France', currency: 'EUR', timezone: 'Europe/Paris' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', timezone: 'Europe/London' },
  {
    code: 'ID',
    name: 'Indonesia',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    timezones: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Pontianak'],
  },
  { code: 'IE', name: 'Ireland', currency: 'EUR', timezone: 'Europe/Dublin' },
  { code: 'IN', name: 'India', currency: 'INR', timezone: 'Asia/Kolkata' },
  { code: 'IT', name: 'Italy', currency: 'EUR', timezone: 'Europe/Rome' },
  { code: 'JP', name: 'Japan', currency: 'JPY', timezone: 'Asia/Tokyo' },
  { code: 'KE', name: 'Kenya', currency: 'KES', timezone: 'Africa/Nairobi' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', timezone: 'Asia/Kuala_Lumpur' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', timezone: 'Africa/Lagos' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', timezone: 'Europe/Amsterdam' },
  { code: 'NO', name: 'Norway', currency: 'NOK', timezone: 'Europe/Oslo' },
  {
    code: 'MX',
    name: 'Mexico',
    currency: 'MXN',
    timezone: 'America/Mexico_City',
    timezones: [
      'America/Mexico_City',
      'America/Cancun',
      'America/Monterrey',
      'America/Chihuahua',
      'America/Tijuana',
    ],
  },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', timezone: 'Pacific/Auckland' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', timezone: 'Asia/Manila' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', timezone: 'Asia/Karachi' },
  { code: 'PL', name: 'Poland', currency: 'PLN', timezone: 'Europe/Warsaw' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', timezone: 'Europe/Lisbon' },
  { code: 'QA', name: 'Qatar', currency: 'QAR', timezone: 'Asia/Qatar' },
  {
    code: 'RU',
    name: 'Russia',
    currency: 'RUB',
    timezone: 'Europe/Moscow',
    timezones: [
      'Europe/Moscow',
      'Europe/Kaliningrad',
      'Asia/Yekaterinburg',
      'Asia/Novosibirsk',
      'Asia/Krasnoyarsk',
      'Asia/Irkutsk',
      'Asia/Vladivostok',
    ],
  },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', timezone: 'Asia/Riyadh' },
  { code: 'SE', name: 'Sweden', currency: 'SEK', timezone: 'Europe/Stockholm' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', timezone: 'Asia/Singapore' },
  { code: 'TR', name: 'Türkiye', currency: 'TRY', timezone: 'Europe/Istanbul' },
  {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    timezone: 'America/New_York',
    timezones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
    ],
  },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', timezone: 'Africa/Johannesburg' },
] as const;

/** Fallback when the device country is not in the table. */
export const DEFAULT_COUNTRY: Country = {
  code: 'GB',
  name: 'United Kingdom',
  currency: 'GBP',
  timezone: 'Europe/London',
};

export function findCountry(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  return countries.find((country) => country.code === upper);
}

/**
 * Timezone options for a country: its main zones first (when it spans
 * several), then every other IANA zone. Any zone in the world stays choosable.
 */
export function timezoneOptionsFor(countryCode: string | null | undefined): readonly string[] {
  const country = findCountry(countryCode);
  const preferred = country?.timezones ?? (country ? [country.timezone] : []);
  const rest = allTimezones.filter((zone) => !preferred.includes(zone));
  return [...preferred, ...rest];
}
