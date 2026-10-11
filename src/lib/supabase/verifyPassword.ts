import { createClient } from '@supabase/supabase-js';

import { env } from '@/config/env';

/**
 * Checks a password for an account WITHOUT touching the app's own session: a throw-away client that stores
 * nothing signs in and out again. Used to re-ask for the current password before a sensitive change.
 * Resolves false for a wrong password; throws only when the check itself could not run (offline, not configured).
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error('Supabase is not configured.');
  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // A separate key, so the browser does not warn about two clients sharing one storage entry.
      storageKey: 'wapee-verify-password',
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 400 || error.code === 'invalid_credentials') return false;
    throw new Error(error.message);
  }
  // 'local': revoke only the session just created, never the person's real ones.
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  return Boolean(data.session);
}
