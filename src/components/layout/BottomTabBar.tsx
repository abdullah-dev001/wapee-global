import type { Tabs } from 'expo-router';
import { MoreHorizontal, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { navLabelKey, primaryNavItems } from '@/config/navigation';
import { useVisibleNav } from '@/lib/permissions';
import { focusRing, theme } from '@/lib/theme';

/**
 * The tab-bar props, taken from the Tabs navigator itself rather than an
 * internal react-navigation path (expo-router vendors react-navigation).
 */
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Icons by route name, so the bar stays driven by `config/navigation`. */
const iconByName: Record<string, LucideIcon> = {
  ...Object.fromEntries(primaryNavItems.map((item) => [item.route.replace('/', ''), item.icon])),
  more: MoreHorizontal,
};

type NavLabelKey = ReturnType<typeof navLabelKey>;

const labelKeyByName: Record<string, NavLabelKey> = {
  ...Object.fromEntries(
    primaryNavItems.map((item) => [item.route.replace('/', ''), navLabelKey(item.id)]),
  ),
  more: navLabelKey('more'),
};

/**
 * Mobile bottom tab bar (CLAUDE.md §4). One identical bar on Android, iOS and
 * mobile web: we render it ourselves and let Expo Router's Tabs navigator keep
 * the routing, per-tab history and state restoration.
 *
 * It always adds `insets.bottom`, so it clears the iOS home indicator and the
 * Android 3-button navigation bar.
 */
export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isRouteAllowed, isPending } = useVisibleNav();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const Icon = iconByName[route.name];
        const labelKey = labelKeyByName[route.name];
        if (!Icon || !labelKey) return null;
        // A tab the member may not open is dropped from the bar. The screen stays
        // registered (routing must survive), and its RouteGuard refuses it.
        if (!isPending && !isRouteAllowed(`/${route.name}`)) return null;

        return (
          <TabButton
            key={route.key}
            icon={Icon}
            label={t(labelKey)}
            focused={focused}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          />
        );
      })}
    </View>
  );
}

function TabButton({
  icon: Icon,
  label,
  focused,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const { handlers, showFocusRing } = useInteractionState(false);
  const color = focused ? theme.colors.primary : theme.colors.textSecondary;

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={[styles.tab, showFocusRing ? focusRing() : null]}
    >
      <Icon size={theme.iconSize.lg} strokeWidth={focused ? 2 : theme.iconStroke} color={color} />
      <Text
        variant="badge"
        numberOfLines={1}
        // Tab labels are tight; cap scaling so large system fonts cannot break the bar.
        maxFontSizeMultiplier={1.3}
        style={{ color }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    paddingTop: theme.spacing[8],
    paddingBottom: theme.spacing[8],
    // 44px minimum touch target (CLAUDE.md §4).
    minHeight: theme.layout.minTouchTarget,
  },
});
