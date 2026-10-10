import { z } from 'zod';

import { brand } from '@/config/brand';

/**
 * Public (client-safe) environment, validated with zod.
 * Missing or invalid values never crash the app: they become `undefined`
 * and a single dev warning lists them. Server secrets never belong here.
 *
 * Each variable must be referenced as `process.env.EXPO_PUBLIC_X` (dot notation)
 * so Expo can inline it at build time.
 */

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: optionalUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  EXPO_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
  EXPO_PUBLIC_SITE_URL: optionalUrl,
});

type EnvKey = keyof z.infer<typeof envSchema>;

const raw: Record<EnvKey, string | undefined> = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_VAPID_PUBLIC_KEY: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY,
  EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL,
};

/** Validate each key on its own so one bad value does not drop the others. */
function parseEnv() {
  const values: Partial<Record<EnvKey, string>> = {};
  const invalid: EnvKey[] = [];
  for (const key of Object.keys(envSchema.shape) as EnvKey[]) {
    const result = envSchema.shape[key].safeParse(raw[key]);
    if (result.success) {
      if (result.data !== undefined) values[key] = result.data;
    } else {
      invalid.push(key);
    }
  }
  return { values, invalid };
}

const { values, invalid } = parseEnv();

export const env = {
  supabaseUrl: values.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: values.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  vapidPublicKey: values.EXPO_PUBLIC_VAPID_PUBLIC_KEY,
  siteUrl: brand.urls.site,
} as const;

/** True when the app can talk to Supabase. */
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

const required: EnvKey[] = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
/** Missing keys the app needs to reach the backend. */
export const missingEnvKeys: readonly EnvKey[] = required.filter((key) => !values[key]);
/** Keys that are set but invalid (for example a malformed URL). */
export const invalidEnvKeys: readonly EnvKey[] = invalid;

let warned = false;

/** Logs one dev-only warning about missing/invalid env. Safe to call many times. */
export function warnAboutEnv(): void {
  if (warned || !__DEV__) return;
  warned = true;
  if (missingEnvKeys.length > 0) {
    console.warn(
      `[env] Missing: ${missingEnvKeys.join(', ')}. Copy .env.example to .env and fill it in. ` +
        'The app runs, but backend calls are disabled.',
    );
  }
  if (invalidEnvKeys.length > 0) {
    console.warn(`[env] Invalid value (ignored): ${invalidEnvKeys.join(', ')}.`);
  }
}
