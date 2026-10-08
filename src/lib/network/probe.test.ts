import { describe, expect, it, vi } from 'vitest';

import { isOfflineState, probeConnection } from './probe';

describe('isOfflineState', () => {
  it('offline when not connected or internet unreachable', () => {
    expect(isOfflineState({ isConnected: false, isInternetReachable: false })).toBe(true);
    expect(isOfflineState({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(isOfflineState({ isConnected: false, isInternetReachable: null })).toBe(true);
  });
  it('online when connected, or while reachability is still unknown', () => {
    expect(isOfflineState({ isConnected: true, isInternetReachable: true })).toBe(false);
    expect(isOfflineState({ isConnected: true, isInternetReachable: null })).toBe(false);
    expect(isOfflineState({ isConnected: null, isInternetReachable: null })).toBe(false);
  });
});

describe('probeConnection', () => {
  it('true when the request resolves, whatever the status; uses no-store + no-cors', async () => {
    const f = vi.fn().mockResolvedValue({ status: 503 });
    expect(await probeConnection(f as unknown as typeof fetch, 'https://x.example/h')).toBe(true);
    expect(f.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      mode: 'no-cors',
      method: 'GET',
    });
  });
  it('false when the request fails', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await probeConnection(f as unknown as typeof fetch, 'https://x.example/h')).toBe(false);
  });
  it('false when it is aborted by the timeout', async () => {
    vi.useFakeTimers();
    const f = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError'))),
        ),
    );
    const p = probeConnection(f as unknown as typeof fetch, 'https://x.example/h');
    await vi.advanceTimersByTimeAsync(6100);
    expect(await p).toBe(false);
    vi.useRealTimers();
  });
});
