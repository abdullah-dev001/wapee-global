import * as NavigationBar from 'expo-navigation-bar';
import { StatusBar, type StatusBarStyle } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Platform, RefreshControl, StyleSheet, View, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { theme } from '@/lib/theme';
import { type ColorToken } from '@/lib/theme/colors';

export type ScreenProps = {
  children: ReactNode;
  /** Scrolls the content (default). `false` for screens that manage their own list. */
  scroll?: boolean;
  /**
   * Which edges get safe-area padding. Default top + bottom.
   *
   * **Pass `['top']` on any screen inside the bottom tabs.** The tab bar already
   * sits in the bottom inset and adds its own padding, so keeping 'bottom' here
   * pads it twice: barely visible on iOS, but a ~48px dead gap on Android with
   * 3-button navigation.
   */
  edges?: readonly Edge[];
  /** Screen background. Default `background`. */
  background?: ColorToken;
  /** Status bar icon style. Default `dark` (dark icons for light screens). */
  statusBarStyle?: StatusBarStyle;
  /** Pull-to-refresh (native); ignored when `scroll` is false. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Extra bottom padding, e.g. the height of a sticky action bar. */
  bottomInset?: number;
  /** Sticky element pinned above the bottom safe area (action bar, FAB row). */
  footer?: ReactNode;
  contentContainerStyle?: ViewStyle;
  style?: ViewStyle;
  testID?: string;
};

/**
 * The base every screen sits on (CLAUDE.md §4). It owns:
 * - safe areas via insets, never hard-coded padding
 * - the status bar style, and the Android navigation bar button style
 * - keyboard avoidance (inputs stay visible, sticky footer rises with the keyboard)
 * - scrolling with pull-to-refresh on native
 *
 * It deliberately does NOT add page padding: that is `PageContainer`'s job, so a
 * full-bleed screen (calendar, media) can use `Screen` without fighting padding.
 */
export function Screen({
  children,
  scroll = true,
  edges = ['top', 'bottom'],
  background = 'background',
  statusBarStyle = 'dark',
  onRefresh,
  refreshing = false,
  bottomInset = 0,
  footer,
  contentContainerStyle,
  style,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const backgroundColor = theme.colors[background];

  // Android navigation bar buttons, matched to the screen.
  // 'dark' = dark buttons on a light bar. Verified in the native source
  // (NavigationBarModule.kt: `val hasLightBackground = style == "dark"`),
  // because the TypeScript doc comment for setStyle describes it the other
  // way round. Takes effect only with button navigation and the plugin's
  // enforceContrast: false, which app.config.ts sets.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setStyle(statusBarStyle === 'light' ? 'light' : 'dark');
  }, [statusBarStyle]);

  const padTop = edges.includes('top') ? insets.top : 0;
  const padBottom = edges.includes('bottom') ? insets.bottom : 0;
  const padStart = edges.includes('left') ? insets.left : 0;
  const padEnd = edges.includes('right') ? insets.right : 0;

  const contentPadding: ViewStyle = {
    paddingTop: padTop,
    paddingStart: padStart,
    paddingEnd: padEnd,
    // A pinned footer carries the bottom inset itself.
    paddingBottom: (footer ? 0 : padBottom) + bottomInset,
  };

  return (
    <View style={[styles.root, { backgroundColor }, style]} testID={testID}>
      <StatusBar style={statusBarStyle} />
      {scroll ? (
        <KeyboardAwareScrollView
          style={styles.fill}
          contentContainerStyle={[styles.scrollContent, contentPadding, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bottomOffset={theme.spacing[16]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <View style={[styles.fill, contentPadding, contentContainerStyle]}>{children}</View>
      )}

      {footer ? (
        // Rises with the keyboard so a sticky Save button is never hidden.
        <KeyboardStickyView offset={{ closed: 0, opened: padBottom }}>
          <View style={[styles.footer, { paddingBottom: padBottom }]}>{footer}</View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  footer: {
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
});
