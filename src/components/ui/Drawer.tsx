import { X } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { focusRing, shadow, theme, useBreakpoint } from '@/lib/theme';

import { Text } from './Text';
import { useInteractionState } from './useInteractionState';
import { useOverlayDismiss } from './useOverlayDismiss';

/** Icon-button hit area for the header close control (DESIGN_GUIDE §12.18). */
const CLOSE_BUTTON_SIZE = 32;

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned footer, typically Cancel + Save. */
  footer?: ReactNode;
};

/**
 * Side panel: 480px from the end edge on tablet/desktop, full-screen sheet on
 * mobile. Escape and Android back close it. Body, header and footer are separate
 * so the body scrolls while the footer stays pinned above the safe area.
 */
export function Drawer({ open, onClose, title, subtitle, children, footer }: DrawerProps) {
  const { isMobile } = useBreakpoint();
  const insets = useSafeAreaInsets();
  useOverlayDismiss(open, onClose);

  return (
    <Modal
      visible={open}
      transparent
      animationType={isMobile ? 'slide' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close panel"
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            shadow('drawer'),
            isMobile ? styles.panelMobile : styles.panelDesktop,
            { paddingTop: insets.top },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="dialogTitle">{title}</Text>
              {subtitle ? (
                <Text variant="small" color="textSecondary">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <CloseButton onPress={onClose} />
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? (
            <View style={[styles.footer, { paddingBottom: theme.spacing[16] + insets.bottom }]}>
              {footer}
            </View>
          ) : (
            <View style={{ height: insets.bottom }} />
          )}
        </View>
      </View>
    </Modal>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const { handlers, showHover, showFocusRing } = useInteractionState(false);
  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={[
        styles.closeButton,
        showHover ? { backgroundColor: theme.colors.surfaceHover } : null,
        showFocusRing ? focusRing() : null,
      ]}
    >
      <X
        size={theme.iconSize.md}
        strokeWidth={theme.iconStroke}
        color={theme.colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // The Modal root does not stretch on its own on web; pin to the viewport.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: theme.colors.surface,
    flexDirection: 'column',
  },
  panelDesktop: {
    width: theme.layout.drawerWidth,
    maxWidth: '100%',
    height: '100%',
  },
  panelMobile: {
    width: '100%',
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[18],
    paddingHorizontal: theme.spacing[20],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  headerText: {
    flex: 1,
    gap: theme.spacing[2],
  },
  closeButton: {
    width: CLOSE_BUTTON_SIZE,
    height: CLOSE_BUTTON_SIZE,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: -theme.spacing[4],
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: theme.spacing[20],
    gap: theme.spacing[16],
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing[8],
    paddingTop: theme.spacing[16],
    paddingHorizontal: theme.spacing[20],
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.border,
  },
});
