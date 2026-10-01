import { type AuthStorage } from './authStorage.types';

/**
 * Supabase auth session storage for web: localStorage.
 * SSR-safe: during static rendering there is no `window`, so it behaves as empty storage.
 */

function getLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    // Access can throw in some private modes / blocked storage.
    return null;
  }
}

export const authStorage: AuthStorage = {
  getItem: (key) => getLocalStorage()?.getItem(key) ?? null,
  setItem: (key, value) => {
    getLocalStorage()?.setItem(key, value);
  },
  removeItem: (key) => {
    getLocalStorage()?.removeItem(key);
  },
};
