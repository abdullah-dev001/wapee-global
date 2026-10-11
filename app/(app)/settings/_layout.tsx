import { Stack } from 'expo-router';

/**
 * Claims the `settings/` directory as its OWN Stack, so the parent Tabs navigator
 * sees one "settings" screen instead of flattening every file in here into a
 * separate tab route (the same trap `clients/_layout.tsx` documents).
 */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
