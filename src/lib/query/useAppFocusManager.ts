import { focusManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

/**
 * On native, tells TanStack Query when the app comes to the foreground so
 * `refetchOnWindowFocus` works like it does on web. No-op on web.
 */
export function useAppFocusManager(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onChange = (status: AppStateStatus) => focusManager.setFocused(status === 'active');
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);
}
