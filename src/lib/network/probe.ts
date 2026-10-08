import { env } from '@/config/env';
import { brand } from '@/config/brand';

const PROBE_TIMEOUT_MS = 6000;

/** The cheapest public URL we depend on anyway: the Supabase Auth health endpoint, else the public site. */
export function probeUrl(): string {
  return env.supabaseUrl
    ? `${env.supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`
    : brand.urls.publicSite;
}

/**
 * A small REAL request: resolves true when the network answered at all (any status), false when the
 * request failed or timed out. `no-cors` + `no-store`: nothing is read and nothing is cached.
 * `navigator.onLine` / NetInfo can be wrong (captive portals, emulation), this cannot.
 */
export async function probeConnection(
  fetchImpl: typeof fetch = fetch,
  url: string = probeUrl(),
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetchImpl(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** NetInfo state to "offline". `isInternetReachable` is null while unknown: treated as online. */
export function isOfflineState(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}
