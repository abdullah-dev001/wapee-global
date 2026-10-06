/**
 * Many database functions never raise for an expected failure: they return
 * `{ ok: false, code: '...' }` (so a rate-limit counter or a transaction is never
 * rolled back by an exception). `unwrapRpc` turns that shape into a thrown
 * `RpcError` carrying the code, so TanStack mutations and the screens' error maps
 * work with one type. A transport/Postgres error becomes a plain `Error`.
 */
export class RpcError extends Error {
  readonly code: string;
  readonly extra: Record<string, unknown>;

  constructor(code: string, extra: Record<string, unknown> = {}) {
    super(code);
    this.name = 'RpcError';
    this.code = code;
    this.extra = extra;
  }
}

export function unwrapRpc<T extends Record<string, unknown>>(
  data: unknown,
  error: { message: string } | null,
): T {
  if (error) throw new Error(error.message);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RpcError('unknown');
  }
  const result = data as Record<string, unknown>;
  if (result.ok === false) {
    const { ok: _ok, code, ...extra } = result;
    throw new RpcError(typeof code === 'string' ? code : 'unknown', extra);
  }
  return result as T;
}

/** The code of an `RpcError`, or null for anything else. */
export function rpcCode(error: unknown): string | null {
  return error instanceof RpcError ? error.code : null;
}
