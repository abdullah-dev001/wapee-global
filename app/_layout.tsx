import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ServiceWorkerUpdater } from '@/components/layout/ServiceWorkerUpdater';
import { ToastProvider } from '@/components/ui';
import { AuthGate, SessionProvider } from '@/features/auth';
import { useTabletOrientation } from '@/lib/device/useTabletOrientation';
import { applyDirection, i18n } from '@/lib/i18n';
import { queryClient, useAppFocusManager, useOnlineManager } from '@/lib/query';
import { useSupabaseAutoRefresh } from '@/lib/supabase';
import { theme, useAppFonts } from '@/lib/theme';

// Keep the native splash visible until fonts are ready. No-op on web.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: theme.duration.base, fade: true });

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const ready = fontsLoaded || fontError !== null;

  useAppFocusManager();
  useOnlineManager();
  useTabletOrientation();
  useSupabaseAutoRefresh();

  useEffect(() => {
    applyDirection(i18n.language);
  }, []);

  useEffect(() => {
    if (fontError) console.error('[fonts] DM Sans failed to load', fontError);
  }, [fontError]);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <I18nextProvider i18n={i18n}>
            <QueryClientProvider client={queryClient}>
              <ToastProvider>
                <ServiceWorkerUpdater />
                <StatusBar style="dark" />
                <SessionProvider>
                  <AuthGate>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: theme.colors.background },
                      }}
                    />
                  </AuthGate>
                </SessionProvider>
              </ToastProvider>
            </QueryClientProvider>
          </I18nextProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
