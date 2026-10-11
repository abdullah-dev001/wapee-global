import { Stack } from 'expo-router';

/**
 * Claims the `clients/` directory as its OWN Stack, so the parent Tabs
 * navigator sees exactly one "clients" screen (this Stack) instead of
 * flattening `index.tsx` and `[id].tsx` in as two separate sibling tab
 * screens — which is what happened without this file (confirmed by
 * logging the Tabs navigator's own route list: `clients/index` and
 * `clients/[id]` both appeared as top-level tab routes, and the bottom
 * tab bar's name-based lookups broke because of it).
 */
export default function ClientsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
