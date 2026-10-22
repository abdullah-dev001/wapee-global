import { type Json } from '@/lib/supabase/database.types';

import { unwrapAdminResult } from '../adminLogic';

/**
 * Runs an admin RPC and unwraps its `{ok, code}` result: an `ok:false` result
 * throws `AdminRpcError(code)`, which the screens map to a message. The RPCs
 * check the platform flag and a fresh password session themselves; this is not a boundary.
 */
export async function callAdminRpc<T extends Record<string, unknown>>(
  run: () => PromiseLike<{ data: Json | null; error: { code?: string; message?: string } | null }>,
): Promise<T> {
  const { data, error } = await run();
  return unwrapAdminResult<T>(data, error);
}
