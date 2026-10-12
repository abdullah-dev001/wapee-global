import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppShell, BottomTabBar, InstallHint } from '@/components/layout';
import { NoIndexHead } from '@/components/shared';
import { ReviewLinkDialogHost } from '@/features/reviews/components/ReviewLinkDialogHost';
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
      <NoIndexHead />
      <InstallHint />
      <ReviewLinkDialogHost />
      <Tabs
        tabBar={isMobile ? (props) => <BottomTabBar {...props} /> : () => null}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      >
        {/*
         * Every screen stays registered whatever the permissions hold, or Expo
         * Router would lose the route and a typed URL would 404 instead of being
         * refused. Gating happens in two honest places instead: `BottomTabBar`
         * and `Sidebar` drop what the member may not open, and each screen's
         * `RouteGuard` refuses it.
         */}
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
