export {
  supabase,
  getSupabase,
  isSupabaseConfigured,
  SupabaseNotConfiguredError,
  type AppSupabaseClient,
} from './client';
export { useSupabaseAutoRefresh } from './useSupabaseAutoRefresh';
export { type Database, type Json } from './database.types';
export { RpcError, rpcCode, rpcNull, unwrapRpc } from './rpcResult';
export { verifyPassword } from './verifyPassword';
