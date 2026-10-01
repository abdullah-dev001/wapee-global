import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shadow, theme } from '@/lib/theme';

import { Button, type ButtonVariant } from './Button';
import { Text } from './Text';
import { useOverlayDismiss } from './useOverlayDismiss';

export type DialogAction = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
};

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Short message. Use `children` instead for richer content. */
  message?: string;
  children?: ReactNode;
  /** Right-aligned primary action (e.g. Delete). Default variant `danger`. */
  confirm?: DialogAction;
  /** Left of confirm. Defaults to a ghost "Cancel" that calls `onClose`. */
  cancelLabel?: string;
  /** Blocks closing by overlay tap / Escape while a confirm is in flight. */
  busy?: boolean;
};

/**
 * Centred modal, max width 416px. Escape and Android back close it;
 * tapping the scrim closes it unless `busy`.
 */
export function Dialog({
  open,
  onClose,
  title,
  message,
  children,
  confirm,
  cancelLabel = 'Cancel',
  busy = false,
}: DialogProps) {
  const insets = useSafeAreaInsets();
  const dismiss = () => {
    if (!busy) onClose();
  };
  useOverlayDismiss(open, dismiss);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityLabel="Close dialog"
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.panel,
            shadow('lg'),
            { marginTop: insets.top, marginBottom: insets.bottom },
          ]}
        >
          <Text variant="dialogTitle">{title}</Text>
          {message ? (
            <Text variant="paragraph" color="textSecondary">
              {message}
            </Text>
          ) : null}
          {children}
          <View style={styles.actions}>
            <Button variant="ghost" onPress={dismiss} disabled={busy}>
              {cancelLabel}
            </Button>
            {confirm ? (
              <Button
                variant={confirm.variant ?? 'danger'}
                onPress={confirm.onPress}
                loading={confirm.loading}
              >
                {confirm.label}
              </Button>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[16],
  },
  panel: {
    width: '100%',
    maxWidth: theme.layout.dialogMaxWidth,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    padding: theme.spacing[24],
    gap: theme.spacing[10],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing[8],
    marginTop: theme.spacing[12],
  },
});
