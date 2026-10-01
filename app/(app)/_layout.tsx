import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppShell, BottomTabBar, InstallHint } from '@/components/layout';
import { navLabelKey, primaryNavItems, secondaryNavItems } from '@/config/navigation';
import { useBreakpoint } from '@/lib/theme';

/**
 * Authenticated area. Expo Router's Tabs navigator owns routing, per-tab history
 * and state restoration; the bar itself is ours (`BottomTabBar`) so Android, iOS
 * and mobile web look identical. On tablet/desktop the bar is hidden and
 * `AppShell` renders the sidebar + header instead.
 */
export default function AppLayout() {
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();

  return (
    <AppShell>
      <InstallHint />
      <Tabs
        tabBar={isMobile ? (props) => <BottomTabBar {...props} /> : () => null}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      >
        {primaryNavItems.map((item) => (
          <Tabs.Screen
            key={item.id}
            name={item.route.replace('/', '')}
            options={{ title: t(navLabelKey(item.id)) }}
          />
        ))}
        <Tabs.Screen name="more" options={{ title: t(navLabelKey('more')) }} />
        {/* Reachable from More and the sidebar, but never shown as a tab. */}
        {secondaryNavItems.map((item) => (
          <Tabs.Screen
            key={item.id}
            name={item.route.replace('/', '')}
            options={{ title: t(navLabelKey(item.id)), href: null }}
          />
        ))}
      </Tabs>
    </AppShell>
  );
}
