/**
 * Reads the manage token from a URL FRAGMENT (`#token=...`), never the query
 * string, so it is never sent to a server or written to an access log
 * (booking-public-page.md's decision, carried over here). Pure so the parsing
 * can be unit-tested without a renderer or a real URL (CLAUDE.md §10a).
 */

/** Extracts and decodes the `token` param from a fragment string (with or without the leading `#`). */
export function parseTokenFromFragment(fragment: string | null | undefined): string | null {
  if (!fragment) return null;
  const withoutHash = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!withoutHash) return null;

  const params = new URLSearchParams(withoutHash);
  const token = params.get('token');
  if (!token) return null;

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}
