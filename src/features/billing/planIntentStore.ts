import { brand } from '@/config/brand';

import { parsePlanParams, parseStoredIntent, type PlanIntent } from './planIntent';

/**
 * Browser storage for the plan choice (see `planIntent.ts`). localStorage, not
 * sessionStorage: the email confirmation link opens in a NEW tab, which has its own
 * empty sessionStorage. A different device is covered by the same choice riding on
 * the confirmation link's query string instead.
 *
 * Native has no web storage and no landing page, so every function here is a no-op
 * there. localStorage can throw (private mode, blocked storage), so all access is
 * guarded; losing the choice only loses a preselect.
 */
const KEY = `${brand.slug}.planIntent`;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readPlanIntent(now: number = Date.now()): PlanIntent | null {
  try {
    return parseStoredIntent(storage()?.getItem(KEY) ?? null, now);
  } catch {
    return null;
  }
}

export function savePlanIntent(intent: Omit<PlanIntent, 'savedAt'>): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ ...intent, savedAt: Date.now() }));
  } catch {
    // Ignore: the Billing screen simply preselects nothing.
  }
}

export function clearPlanIntent(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Ignore: it expires on its own (PLAN_INTENT_TTL_MS).
  }
}

/**
 * Saves `?plan=…&interval=…` from the address the app was opened with. Called once
 * at module load of the root layout, BEFORE Expo Router mounts and before supabase-js
 * clears an auth fragment: a cold load carrying a session briefly rewrites the address
 * to `/` and back, and a value read later could be gone. Reads only; never touches
 * history, so it adds no routing step of its own.
 */
export function captureIntentFromUrl(): void {
  try {
    if (typeof window === 'undefined' || !window.location) return;
    const parsed = parsePlanParams(window.location.search);
    if (parsed) savePlanIntent({ ...parsed, source: 'link' });
  } catch {
    // Ignore: no choice captured.
  }
}
