/**
 * Product identity. The ONLY place the product name lives.
 * Pure constants (no React Native / Expo imports) so `app.config.ts` can import this in Node.
 */

/** ONE origin for everything: landing page, dashboard, admin, public business pages. */
const DEFAULT_SITE_URL = 'https://wapee.online';
const SITE_URL = urlFromEnv(process.env.EXPO_PUBLIC_SITE_URL, DEFAULT_SITE_URL);

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
  bundleId: 'online.wapee.app',
  /** Short description used in the web manifest and meta tags. */
  description: 'Appointment booking for salons, clinics, barbers and more.',
  /**
   * Where a customer writes for help — e.g. an inactive business asking to have
   * a plan assigned. Public support mailbox, shown in the app, landing and legal pages.
   * Switch to 'support@wapee.online' once its forwarding is confirmed.
   */
  supportEmail: 'wapeeglobal@gmail.com',
  /**
   * Who operates the service, shown on /terms and /privacy. The name must match the
   * payment provider's KYC record exactly.
   */
  operator: 'Abdullah, Lahore, Pakistan',
  urls: {
    /**
     * The single origin: landing page (/), dashboard and admin (/login, /today, /admin),
     * business pages (/<slug>, /<slug>/book, manage, review, sign, portal) and email links.
     */
    site: SITE_URL,
    /** Static legal pages (public/privacy.html, public/terms.html, generated /refund). */
    privacy: `${SITE_URL}/privacy`,
    terms: `${SITE_URL}/terms`,
    refund: `${SITE_URL}/refund`,
  },
} as const;

export type Brand = typeof brand;
