/**
 * The single public origin: landing page, dashboard, admin, business pages and
 * every link in an email all live on it (src/config/brand.ts `urls.site`).
 * Set per project with the `PUBLIC_SITE_URL` secret; the default is production.
 */
export const DEFAULT_SITE_URL = 'https://wapee.online';

export function siteUrl(): string {
  const configured = Deno.env.get('PUBLIC_SITE_URL')?.trim();
  return (configured || DEFAULT_SITE_URL).replace(/\/+$/, '');
}
