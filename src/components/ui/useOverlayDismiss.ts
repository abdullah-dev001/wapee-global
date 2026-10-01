import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Shared dismiss behaviour for overlays (Dialog, Drawer, sheets):
 * - web: Escape closes, and body scrolling is locked while open
 * - Android: the hardware/gesture back button closes the overlay first
 *
 * iOS needs neither (no hardware back; the modal blocks scrolling itself).
 */
export function useOverlayDismiss(open: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!open) return;

    if (Platform.OS === 'android') {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        onDismiss();
        return true; // handled: do not also pop the route
      });
      return () => subscription.remove();
    }

    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onDismiss]);
}
