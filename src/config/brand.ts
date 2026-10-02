/**
 * Product identity. The ONLY place the product name lives.
 * Pure constants (no React Native / Expo imports) so `app.config.ts` can import this in Node.
 */

const DEFAULT_APP_URL = 'https://app.wapee.com';
const DEFAULT_PUBLIC_SITE_URL = 'https://wapee.site';

function urlFromEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return (trimmed ? trimmed : fallback).replace(/\/+$/, '');
}

export const brand = {
  /** Display name shown to users. */
  name: 'Wapee',
  /** Expo slug and URL-safe identifier. */
  slug: 'wapee',
  /** Deep link scheme (wapee://). */
  scheme: 'wapee',
  /** iOS bundle identifier and Android package name. Cannot change after store release. */
  bundleId: 'com.wapee.app',
  /** Short description used in the web manifest and meta tags. */
  description: 'Appointment booking for salons, clinics, barbers and more.',
  /**
   * Where a customer writes for help — e.g. an inactive business asking to have
   * a plan assigned. PLACEHOLDER until the real domain and mailbox exist.
   */
  supportEmail: 'support@wapee.com',
  urls: {
    /** Dashboard / PWA origin. Placeholder until a domain is bought. */
    app: urlFromEnv(process.env.EXPO_PUBLIC_APP_URL, DEFAULT_APP_URL),
    /** Public business websites live on a separate domain. Placeholder until a domain is bought. */
    publicSite: urlFromEnv(process.env.EXPO_PUBLIC_PUBLIC_SITE_URL, DEFAULT_PUBLIC_SITE_URL),
  },
} as const;

export type Brand = typeof brand;
