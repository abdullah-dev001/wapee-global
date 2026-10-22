import { Stack } from 'expo-router';

import { NoIndexHead } from '@/components/shared';
import { theme } from '@/lib/theme';

/**
 * Super admin area. The navigator must always be mounted (a layout that renders
 * something else makes Expo Router lose the route), so the guard wraps each SCREEN
 * (`AdminGuard` in every route file): "not found" for anyone without the platform
 * flag, only the sign-in-again screen for a flagged session that is not a password
 * sign-in from the last 12 hours. Every admin RPC enforces
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
