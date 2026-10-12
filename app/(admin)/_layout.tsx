import { Stack } from 'expo-router';

import { NoIndexHead } from '@/components/shared';
import { theme } from '@/lib/theme';

/**
 * Super admin area. The navigator must always be mounted (a layout that renders
 * something else makes Expo Router lose the route), so the guard wraps each SCREEN
 * (`AdminGuard` in every route file): "not found" for anyone without the platform
 * flag, only the 2FA screen for a flagged aal1 session. Every admin RPC enforces
 * the same rule, so this is convenience, not the boundary.
 */
export default function AdminLayout() {
  return (
    <>
      <NoIndexHead />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
    </>
  );
}
