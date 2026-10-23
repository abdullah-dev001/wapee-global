/**
 * The Polar REST calls billing needs, with plain fetch (no SDK; founder decision 2026-10-23).
 * No Deno globals here (the token and server come in), so it is unit-testable with a fake fetch.
 *
 * Every call returns `{ ok: true, data }` or `{ ok: false, status, error }`; it never throws.
 * `status` 0 = network error or timeout. `error` is Polar's error name (e.g. PaymentFailed,
 * AlreadyCanceledSubscription), never a response body (it can echo customer data).
 */

export type PolarServer = 'sandbox' | 'production';
export type PolarResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export const POLAR_API: Record<PolarServer, string> = {
  sandbox: 'https://sandbox-api.polar.sh/v1',
  production: 'https://api.polar.sh/v1',
};

export type Paginated<T> = { items: T[]; pagination: { total_count: number; max_page: number } };

export function polarClient(cfg: {
  token: string;
  server: PolarServer;
  fetchFn?: FetchFn;
  timeoutMs?: number;
}) {
  const base = POLAR_API[cfg.server];
  const doFetch: FetchFn = cfg.fetchFn ?? ((input, init) => fetch(input, init));
  const timeoutMs = cfg.timeoutMs ?? 8000;

  async function call<T>(method: string, path: string, body?: unknown): Promise<PolarResult<T>> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return { ok: false, status: 0, error: 'network' };
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (res.ok) return { ok: true, data: json as T };
    const name =
      json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : `http_${res.status}`;
    return { ok: false, status: res.status, error: name.slice(0, 80) };
  }

  const q = (params: Record<string, string | number | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) s.set(k, String(v));
    const out = s.toString();
    return out ? `?${out}` : '';
  };

  return {
    getSubscription: (id: string) =>
      call<Record<string, unknown>>('GET', `/subscriptions/${encodeURIComponent(id)}`),
    listSubscriptions: (params: { page: number; limit: number }) =>
      call<Paginated<Record<string, unknown>>>('GET', `/subscriptions/${q(params)}`),
    updateSubscription: (id: string, body: Record<string, unknown>) =>
      call<Record<string, unknown>>('PATCH', `/subscriptions/${encodeURIComponent(id)}`, body),
    revokeSubscription: (id: string) =>
      call<Record<string, unknown>>('DELETE', `/subscriptions/${encodeURIComponent(id)}`),
    getProduct: (id: string) =>
      call<Record<string, unknown>>('GET', `/products/${encodeURIComponent(id)}`),
    createCheckout: (body: Record<string, unknown>) =>
      call<Record<string, unknown>>('POST', '/checkouts/', body),
    createCustomerSession: (body: Record<string, unknown>) =>
      call<Record<string, unknown>>('POST', '/customer-sessions/', body),
    listOrders: (params: { subscription_id: string; page: number; limit: number }) =>
      call<Paginated<Record<string, unknown>>>('GET', `/orders/${q(params)}`),
    createRefund: (body: Record<string, unknown>) =>
      call<Record<string, unknown>>('POST', '/refunds/', body),
  };
}

export type PolarClient = ReturnType<typeof polarClient>;
