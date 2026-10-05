/**
 * CORS for the public booking endpoints.
 *
 * The public booking page is served from the public-site origin, which is a
 * different origin from the Supabase project, so these endpoints need CORS.
 *
 * `Access-Control-Allow-Origin` is echoed from an ALLOW-LIST rather than set to
 * `*`. `*` would be simpler, but it would also let any site on the internet
 * script a booking flow against a business's slug using the visitor's network,
 * which is exactly the abuse vector step 7's rate limiting is meant to make
 * expensive. An allow-list keeps the browser honest for free.
 *
 * The list is driven by `PUBLIC_SITE_ORIGINS` (comma-separated) so the real
 * domains can be set without a code change — the domains are still placeholders
 * (see src/config/brand.ts).
 */

/** Origins allowed to call the public endpoints from a browser. */
function allowedOrigins(): string[] {
  const configured = Deno.env.get('PUBLIC_SITE_ORIGINS');
  if (configured && configured.trim()) {
    return configured
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);
  }
  // Placeholder defaults, matching src/config/brand.ts. The real production
  // domain is a Phase 12 item and must be set via PUBLIC_SITE_ORIGINS — these
  // are only a fallback so development works out of the box.
  //
  // The localhost entries cover the ports Expo actually uses:
  //   8081  `npm run web` (Metro's default)
  //   8082  the port Metro picks when 8081 is taken
  //   8090  the explicit port in context/_handoff.md's commands
  //   8092  the dev-server port for an installed native build
  //   19006 the legacy `expo start --web` port, still seen in older tooling
  // 127.0.0.1 is listed alongside localhost because a browser treats them as
  // different origins and some setups resolve to one and not the other.
  return [
    'https://wapee.site',
    'https://app.wapee.com',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8090',
    'http://localhost:8092',
    'http://localhost:19006',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082',
    'http://127.0.0.1:8090',
    'http://127.0.0.1:8092',
    'http://127.0.0.1:19006',
  ];
}

/**
 * Headers for a response. `origin` is the request's Origin header.
 *
 * An unknown or absent origin gets NO allow-origin header: the browser then
 * blocks the response. A non-browser caller (curl, a server) is unaffected,
 * which is correct — CORS is a browser mechanism and was never a server-side
 * authorisation boundary. The real boundary is the RPC grants plus step 7.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // `apikey` and `authorization` are sent by supabase-js even for an
    // anonymous call; `content-type` for the JSON body.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  const normalised = origin?.replace(/\/+$/, '');
  if (normalised && allowedOrigins().includes(normalised)) {
    headers['Access-Control-Allow-Origin'] = normalised;
  }

  return headers;
}

/** The OPTIONS preflight. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

/**
 * CORS for the ONE endpoint that must be callable from ARBITRARY customer
 * sites: the widget's key/origin validation. It echoes the caller's origin
 * because the allow-list is the data (per-key allowed domains) and cannot be
 * known at preflight time. This is safe only because the function returns
 * nothing for a caller whose origin is not on the key's list: the response is
 * the same generic not_found either way.
 */
export function openCorsHeaders(origin: string | null): Record<string, string> {
  const headers = corsHeaders(null);
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
