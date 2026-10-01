import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from './client';

/**
 * Native only: refresh the auth token while the app is in the foreground and
 * stop when it goes to the background (Supabase recommendation for React Native).
 * Web handles this itself via page visibility.
 */
export function useSupabaseAutoRefresh(): void {
  useEffect(() => {
    if (Platform.OS === 'web' || !supabase) return;
    const client = supabase;
    if (AppState.currentState === 'active') void client.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    return () => {
      subscription.remove();
      void client.auth.stopAutoRefresh();
    };
  }, []);
}
