import { Platform } from 'react-native';

/**
 * The portal SESSION token (not the login link: that one lives in memory only and is stripped from the
 * address bar). Web keeps it in `sessionStorage` (this tab only, gone when it closes); native keeps it in
 * the secure store. Every access is wrapped: storage can be blocked, and the page must still render.
 * The session expires on the server (14 days), can be signed out everywhere, and dies with the add-on.
 */
const key = (slug: string) => `portal.session.${slug}`;

export async function loadSession(slug: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' ? window.sessionStorage.getItem(key(slug)) : null;
    }
    const SecureStore = await import('expo-secure-store');
    return await SecureStore.getItemAsync(key(slug));
  } catch {
    return null;
  }
}

export async function saveSession(slug: string, token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.sessionStorage.setItem(key(slug), token);
      return;
    }
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(key(slug), token);
  } catch {
    // the session then lives only until the page is closed
  }
}

export async function clearSession(slug: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.sessionStorage.removeItem(key(slug));
      return;
    }
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(key(slug));
  } catch {
    // nothing to clear
  }
}
