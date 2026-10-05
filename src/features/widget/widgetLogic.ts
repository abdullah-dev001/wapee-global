/**
 * Widget helpers. PURE.
 *
 * The embed check below is BEST EFFORT. It lets the booking page tell a visitor
 * "this booking form is not available here" and ask the server to confirm the
 * embedding site. It is not a security control: the real boundary is the host's
 * `frame-ancestors` response header.
 */

/** Same shape the database accepts: exact lowercase hostnames, or `localhost`. */
const DOMAIN_RE = /^(localhost|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})$/;

export const MAX_WIDGET_DOMAINS = 10;

/**
 * Turns what an owner pastes ("https://www.Example.com/book?x=1", "example.com:8080")
 * into a bare lowercase hostname. Returns the trimmed lowercase input when it is
 * not URL-like, so validation can report it.
 */
export function normaliseDomainInput(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.replace(/[/?#].*$/, '');
  value = value.replace(/:\d+$/, '');
  return value;
}

export function isValidDomain(host: string): boolean {
  return DOMAIN_RE.test(host);
}

export type DomainListProblem = 'invalid' | 'too_many';

/** Validates an already-normalised list. Duplicates are collapsed by the caller. */
export function domainListProblem(domains: readonly string[]): DomainListProblem | null {
  if (domains.length > MAX_WIDGET_DOMAINS) return 'too_many';
  return domains.every(isValidDomain) ? null : 'invalid';
}

/** Adds a domain, normalising and de-duplicating. */
export function addDomain(list: readonly string[], input: string): string[] {
  const host = normaliseDomainInput(input);
  if (!host || list.includes(host)) return [...list];
  return [...list, host];
}

export type SnippetInput = { publicSiteUrl: string; functionsUrl: string; key: string };

/** The `<script>` tag an owner pastes into their site. */
export function buildWidgetSnippet({ publicSiteUrl, functionsUrl, key }: SnippetInput): string {
  const site = publicSiteUrl.replace(/\/+$/, '');
  const api = functionsUrl.replace(/\/+$/, '');
  return `<script src="${site}/widget.js" data-key="${key}" data-api="${api}" data-app="${site}" async></script>`;
}

/** Supabase Edge Functions base from the project URL. */
export function functionsBaseUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
}

/** Canonical `scheme://host[:port]` (lower-case), or null when not an http(s) origin. */
export function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The origin that is framing this page, as far as the browser tells us:
 * `location.ancestorOrigins[0]` (Chromium, Safari), else the referrer's origin
 * (Firefox). Null when neither is available.
 */
export function pickParentOrigin(input: {
  ancestorOrigins?: readonly string[] | null;
  referrer?: string | null;
}): string | null {
  const fromAncestors = toOrigin(input.ancestorOrigins?.[0]);
  if (fromAncestors) return fromAncestors;
  return toOrigin(input.referrer);
}

export type EmbedState =
  { kind: 'not_embedded' } | { kind: 'check'; token: string; origin: string } | { kind: 'blocked' };

/**
 * What a web booking page should do:
 *  - not framed -> normal;
 *  - framed with a token and a known parent origin -> ask the server to verify;
 *  - framed without a token, or with no way to know the parent -> show the
 *    "not available here" message.
 */
export function embedState(input: {
  isFramed: boolean;
  embedParam: string | null;
  parentOrigin: string | null;
}): EmbedState {
  if (!input.isFramed) return { kind: 'not_embedded' };
  if (!input.embedParam || !input.parentOrigin) return { kind: 'blocked' };
  return { kind: 'check', token: input.embedParam, origin: input.parentOrigin };
}
