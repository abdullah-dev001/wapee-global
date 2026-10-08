import { WifiOff } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui';
import { useNetworkStatus } from '@/lib/network';
import { theme } from '@/lib/theme';

/**
 * Full-screen "No internet connection" state with Retry. Covers EVERYTHING (dashboard, public booking
 * pages, auth) while the device is offline and disappears by itself when the connection returns.
 * The app underneath stays mounted, so no state is lost, and no data is cached or shown from cache.
 */
export function OfflineGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { offline, checking, retry } = useNetworkStatus();

  return (
    <View style={styles.root}>
      {children}
      {offline ? (
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.overlay,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingStart: insets.left,
              paddingEnd: insets.right,
            },
          ]}
        >
          <EmptyState
            icon={WifiOff}
            title={t('offline.title')}
            description={t('offline.description')}
            action={{
              children: checking ? t('offline.checking') : t('offline.retry'),
              onPress: () => void retry(),
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    zIndex: theme.zIndex.toast,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
