import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { env, isSupabaseConfigured, warnAboutEnv } from '@/config/env';

import { authStorage } from './authStorage';
import { type Database } from './database.types';

export type AppSupabaseClient = SupabaseClient<Database>;

const isWeb = Platform.OS === 'web';
const isServer = isWeb && typeof window === 'undefined';

function create(): AppSupabaseClient | null {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: authStorage,
      // Native refresh is driven by AppState (useSupabaseAutoRefresh). Off during static rendering.
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      // Web reads auth redirects (email links) from the URL; native handles deep links itself.
      detectSessionInUrl: isWeb && !isServer,
      // Web uses the default navigator lock; native needs an in-process lock.
      ...(isWeb ? {} : { lock: processLock }),
    },
  });
}

/**
 * The Supabase client, or `null` when env keys are missing.
 * Prefer `getSupabase()` inside query/mutation functions.
 */
export const supabase: AppSupabaseClient | null = create();

if (!isSupabaseConfigured) warnAboutEnv();

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.',
    );
    this.name = 'SupabaseNotConfiguredError';
  }
}

/**
 * Returns the client or throws `SupabaseNotConfiguredError`.
 * Call it inside queryFn/mutationFn so a missing config shows as a normal query
 * error state (with retry), never a crash at import time.
 */
export function getSupabase(): AppSupabaseClient {
  if (!supabase) {
    warnAboutEnv();
    throw new SupabaseNotConfiguredError();
  }
  return supabase;
}

export { isSupabaseConfigured };
