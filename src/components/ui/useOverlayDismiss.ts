import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Shared dismiss behaviour for overlays (Dialog, Drawer, sheets):
 * - web: Escape closes, and body scrolling is locked while open
 * - Android: the hardware/gesture back button closes the overlay first
 *
 * iOS needs neither (no hardware back; the modal blocks scrolling itself).
 *
 * `onDismiss` is held in a ref, so callers may pass an inline arrow safely.
 * Keeping it in the effect's dependencies instead made the effect tear down and
 * re-run on every render, which showed up as "Maximum update depth exceeded".
 */
export function useOverlayDismiss(open: boolean, onDismiss: () => void): void {
  const onDismissRef = useRef(onDismiss);

  // Keep the ref current without writing to it during render.
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => onDismissRef.current();

    if (Platform.OS === 'android') {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        dismiss();
        return true; // handled: do not also pop the route
      });
      return () => subscription.remove();
    }

    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // Only `open` belongs here: the callback is read through the ref.
  }, [open]);
}
