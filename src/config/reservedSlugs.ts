/**
 * Slugs a business can never take for its public page (`/<slug>`).
 *
 * Three reasons a word is here:
 * 1. It is (or will be) an app route — `/login`, `/portal`, `/admin`.
 * 2. It is a standard infrastructure hostname or path — `www`, `api`, `cdn`.
 * 3. It would let a business impersonate Wapee itself — `wapee`, `support`, `billing`.
 *
 * The DB is the real boundary: a CHECK constraint / trigger on `businesses.slug`
 * must reject these too. This list keeps the UI in step and gives a clear error early.
 * Compare lowercase and trimmed. Adding a new app route? Add it here in the same task.
 */

const RESERVED_SLUGS = [
  // App routes (current and planned)
  'login',
  'logout',
  'signup',
  'signin',
  'sign-in',
  'sign-up',
  'register',
  'reset',
  'reset-password',
  'forgot-password',
  'verify',
  'invite',
  'onboarding',
  'app',
  'dashboard',
  'portal',
  'admin',
  'superadmin',
  'super-admin',
  'settings',
  'account',
  'profile',
  'billing',
  'subscribe',
  'subscription',
  'plans',
  'pricing',
  'book',
  'booking',
  'bookings',
  'appointments',
  'calendar',
  'clients',
  'services',
  'staff',
  'invoices',
  'reports',
  'reviews',
  'widget',
  'embed',

  // Infrastructure / conventional hostnames and paths
  'api',
  'www',
  'cdn',
  'static',
  'assets',
  'media',
  'files',
  'img',
  'images',
  'mail',
  'email',
  'smtp',
  'ftp',
  'ns',
  'dns',
  'mx',
  'webhook',
  'webhooks',
  'callback',
  'oauth',
  'auth',
  'sso',
  'graphql',
  'rest',
  'rpc',
  'health',
  'status',
  'test',
  'staging',
  'dev',
  'demo',
  'sandbox',
  'preview',
  'beta',
  'alpha',
  'public',
  'private',
  'internal',
  'system',
  'root',
  'null',
  'undefined',
  'robots.txt',
  'sitemap.xml',
  'favicon.ico',
  'manifest.json',
  'sw.js',
  '.well-known',

  // Brand / trust
  'wapee',
  'wapeeapp',
  'official',
  'support',
  'help',
  'contact',
  'about',
  'legal',
  'privacy',
  'terms',
  'security',
  'abuse',
  'press',
  'blog',
  'news',
  'careers',
  'jobs',
  'partners',
  'affiliate',
  'store',
  'shop',
  'payment',
  'payments',
  'checkout',
] as const;

const reservedSet: ReadonlySet<string> = new Set<string>(RESERVED_SLUGS);

export const reservedSlugs: readonly string[] = RESERVED_SLUGS;

/** Minimum / maximum slug length (keep the DB constraint in step). */
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

/** Lowercase letters, digits and single inner hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when the slug is taken by the platform and a business may not use it. */
export function isReservedSlug(slug: string): boolean {
  return reservedSet.has(slug.trim().toLowerCase());
}
