/**
 * The guest manage link. ONE place owns its shape, so the confirmation email
 * (send_outbox), the preview and the dashboard "copy link" can never drift apart.
 * Route: `(public)/[slug]/manage`; the token rides in the URL FRAGMENT so it is
 * never sent to a server or written to an access log.
 */
export function buildManageUrl(base: string, slug: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(slug)}/manage#token=${encodeURIComponent(token)}`;
}
