import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { breakpoints } from '@/lib/theme/tokens';

/**
 * Phones stay portrait; tablets may rotate (CLAUDE.md §4).
 *
 * iOS handles this in the app config (`UISupportedInterfaceOrientations~ipad`).
 * Android applies one `screenOrientation="portrait"` to the activity, so the lock
 * must be released at runtime when the screen is tablet-sized. Call once, in the
 * root layout. No-op on web.
 */
export function useTabletOrientation(): void {
  const { width, height } = useWindowDimensions();
  // Use the larger edge so a tablet already held in landscape is still detected.
  const isTabletSized = Math.max(width, height) >= breakpoints.tablet;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void ScreenOrientation.lockAsync(
      isTabletSized
        ? ScreenOrientation.OrientationLock.DEFAULT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch((error: unknown) => {
      console.warn('[orientation] lock failed', error);
    });
  }, [isTabletSized]);
}
