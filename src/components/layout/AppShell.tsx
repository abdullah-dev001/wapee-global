import { useTranslation } from 'react-i18next';
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useOverlayDismiss } from '@/components/ui/useOverlayDismiss';
import { TrialBanner } from '@/features/billing/components/TrialBanner';
import { useTrialBannerVisible } from '@/features/billing/useTrialBannerVisible';
import { shadow, theme, useBreakpoint } from '@/lib/theme';

import { ConsumedInsetsProvider } from './ConsumedInsets';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export type AppShellProps = {
  children: ReactNode;
};

/**
 * Authenticated chrome, chosen by breakpoint (CLAUDE.md §4) — never by Platform.OS:
 * - mobile (<768): no chrome here; the bottom tab bar comes from the Tabs layout
 * - tablet (768–1023): header with a hamburger + off-canvas sidebar
 * - desktop (>=1024): fixed 240px sidebar + 64px header
 */
export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation();
  const { isMobile, isDesktop } = useBreakpoint();
  const bannerVisible = useTrialBannerVisible();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Escape (web) and Android back close the off-canvas sidebar first.
  useOverlayDismiss(menuOpen, closeMenu);

  if (isMobile) {
    // The banner is the topmost bar here, so it carries the status-bar inset and
    // the screens below must not add it again.
    return (
      <View style={styles.root}>
        <TrialBanner />
        <ConsumedInsetsProvider top={bannerVisible}>{children}</ConsumedInsetsProvider>
      </View>
    );
  }

  if (isDesktop) {
    return (
      <View style={styles.rootRow}>
        <View style={styles.sidebarFixed}>
          <Sidebar />
        </View>
        <View style={styles.main}>
          <Header />
          <TrialBanner />
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    );
  }

  // Tablet: header + off-canvas sidebar.
  return (
    <View style={styles.root}>
      <Header onOpenMenu={() => setMenuOpen(true)} />
      <TrialBanner />
      <View style={styles.content}>{children}</View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeMenu}
            accessibilityLabel={t('nav.closeMenu')}
          />
          <View style={[styles.sidebarOverlay, shadow('lg')]}>
            <Sidebar onNavigate={closeMenu} onClose={closeMenu} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  rootRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
  },
  sidebarFixed: {
    width: theme.layout.sidebarWidth,
    zIndex: theme.zIndex.sidebar,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
    // Panel sits on the start edge, so it also reads correctly in RTL.
    flexDirection: 'row',
    justifyContent: 'flex-start',
    zIndex: theme.zIndex.overlay,
  },
  sidebarOverlay: {
    height: '100%',
    zIndex: theme.zIndex.drawer,
  },
});
