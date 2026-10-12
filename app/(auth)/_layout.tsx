import { Stack } from 'expo-router';

import { NoIndexHead } from '@/components/shared';

/**
 * Auth area (login, signup, onboarding, password reset, invite accept, email verify).
 * No custom options: this group had no `_layout.tsx` before (Expo Router used the root's
 * default Stack) — this file exists only to mount `NoIndexHead` once for the whole group
 * instead of on each of the 7 screens.
 */
export default function AuthLayout() {
  return (
    <>
      <NoIndexHead />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
