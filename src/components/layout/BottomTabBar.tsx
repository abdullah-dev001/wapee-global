import type { Tabs } from 'expo-router';
import { MoreHorizontal, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { navLabelKey, primaryNavItems } from '@/config/navigation';
import { usePendingApprovalCount } from '@/features/appointments/api/usePendingApprovalCount';
import { useCurrentScope, usePermission, useVisibleNav } from '@/lib/permissions';
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
  const { businessId, branchId } = useCurrentScope();
  const canApprove = usePermission('appointments.approve');
  // Only roles holding appointments.approve see the pending count — a Staff
  // member cannot act on it (doc §9), so showing it to them would just be noise.
  const pendingApproval = usePendingApprovalCount(canApprove.allowed ? businessId : null, branchId);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        // A folder-based tab (`clients/index.tsx`, a Tabs.Screen name="clients"
        // pointing at a directory) reports its ACTUAL route.name as
        // "clients/index", not "clients" — only a flat file keeps the plain
        // name. Normalize so the config-driven lookups below (which use the
        // plain `/clients`-style name from config/navigation.ts) still match.
        const normalizedName = route.name.replace(/\/index$/, '');
        // A sibling detail screen inside the same folder (`clients/[id]`)
        // gets flattened into this SAME Tabs route list by Expo Router —
        // it is not a nav destination, so it is never in iconByName and is
        // correctly dropped by the check below without special-casing it.
        const focused = state.index === index;
        const Icon = iconByName[normalizedName];
        const labelKey = labelKeyByName[normalizedName];
        if (!Icon || !labelKey) return null;
        // A tab the member may not open is dropped from the bar. The screen stays
        // registered (routing must survive), and its RouteGuard refuses it.
        if (!isPending && !isRouteAllowed(`/${normalizedName}`)) return null;

        return (
          <TabButton
            key={route.key}
            icon={Icon}
            label={t(labelKey)}
            focused={focused}
            badgeCount={
              normalizedName === 'calendar' && canApprove.allowed ? pendingApproval.data : undefined
            }
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
  badgeCount,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  focused: boolean;
  /** A small count dot on the icon; 0/undefined shows nothing. */
  badgeCount?: number;
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
      <View>
        <Icon size={theme.iconSize.lg} strokeWidth={focused ? 2 : theme.iconStroke} color={color} />
        {badgeCount ? <View style={styles.badgeDot} /> : null}
      </View>
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
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.error,
  },
});
