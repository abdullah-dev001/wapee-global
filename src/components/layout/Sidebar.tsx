import { usePathname, useRouter } from 'expo-router';
import { LogOut, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { brand } from '@/config/brand';
import { navLabelKey, type NavItem } from '@/config/navigation';
import { AdminEntry } from '@/features/admin/components';
import { useSignOut } from '@/features/auth';
import { useVisibleNav } from '@/lib/permissions';
import { focusRing, theme } from '@/lib/theme';

import { Skeleton } from '../ui/Skeleton';

export type SidebarProps = {
  /** Called after a nav item is tapped, so the overlay variant can close itself. */
  onNavigate?: () => void;
  /** Shows the close button (tablet / mobile off-canvas). */
  onClose?: () => void;
};

/**
 * Teal sidebar, 240px (DESIGN_GUIDE §13.2). Fixed on desktop; rendered inside an
 * off-canvas overlay on tablet. Items come from `config/navigation`.
 */
export function Sidebar({ onNavigate, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // Only the destinations this member may actually open (CLAUDE.md §7).
  const { items, isPending } = useVisibleNav();

  return (
    <View style={[styles.sidebar, { paddingTop: insets.top }]}>
      <View style={styles.logoArea}>
        <Text variant="cardTitle" color="sidebarActive">
          {brand.name}
        </Text>
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('actions.close')}
            style={styles.closeButton}
          >
            <X
              size={theme.iconSize.lg}
              strokeWidth={theme.iconStroke}
              color={theme.colors.sidebarText}
            />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.nav}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        {isPending
          ? // Placeholders, so the menu never shows items that vanish a frame later.
            [0, 1, 2, 3, 4].map((row) => (
              <View key={row} style={styles.itemSkeleton}>
                <Skeleton height={20} radius="sm" />
              </View>
            ))
          : items.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                active={pathname.startsWith(item.route)}
                onNavigate={onNavigate}
              />
            ))}
        <AdminEntry variant="sidebar" onNavigate={onNavigate} />
      </ScrollView>

      <View style={[styles.account, { paddingBottom: theme.spacing[12] + insets.bottom }]}>
        <SidebarLogout />
      </View>
    </View>
  );
}

function SidebarItem({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const Icon = item.icon;

  const backgroundColor = active
    ? theme.colors.sidebarActive
    : showHover
      ? theme.colors.sidebarHover
      : theme.colors.transparent;
  const color = active
    ? theme.colors.sidebarActiveText
    : showHover
      ? theme.colors.textOnPrimary
      : theme.colors.sidebarText;

  return (
    <Pressable
      {...handlers}
      onPress={() => {
        router.push(item.route);
        onNavigate?.();
      }}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={[styles.item, { backgroundColor }, showFocusRing ? focusRing() : null]}
    >
      <Icon size={theme.iconSize.sm} strokeWidth={theme.iconStroke} color={color} />
      <Text variant={active ? 'bodyStrong' : 'nav'} numberOfLines={1} style={{ color }}>
        {t(navLabelKey(item.id))}
      </Text>
    </Pressable>
  );
}

function SidebarLogout() {
  const { t } = useTranslation();
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  const signOut = useSignOut();
  const color = showHover ? theme.colors.textOnPrimary : theme.colors.sidebarText;

  return (
    <Pressable
      {...handlers}
      onPress={() => signOut.mutate()}
      disabled={signOut.isPending}
      accessibilityRole="button"
      style={[
        styles.item,
        showHover ? { backgroundColor: theme.colors.sidebarHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <LogOut size={theme.iconSize.xs} strokeWidth={theme.iconStroke} color={color} />
      <Text variant="small" style={{ color }}>
        {t('nav.logout')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: theme.layout.sidebarWidth,
    maxWidth: '85%',
    height: '100%',
    backgroundColor: theme.colors.sidebarBg,
    flexDirection: 'column',
  },
  logoArea: {
    height: theme.layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[20],
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    flex: 1,
  },
  navContent: {
    paddingHorizontal: theme.spacing[12],
    paddingTop: theme.spacing[8],
    paddingBottom: theme.spacing[12],
    gap: theme.spacing[2],
  },
  itemSkeleton: {
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[14],
    // Matches `item`, so the menu does not jump when the real rows arrive.
    minHeight: theme.layout.minTouchTarget,
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[14],
    borderRadius: theme.radius.md,
    minHeight: theme.layout.minTouchTarget,
  },
  account: {
    paddingHorizontal: theme.spacing[12],
    paddingTop: theme.spacing[12],
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.sidebarHover,
  },
});
