import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Feeds NetInfo's connectivity state into TanStack Query on native, so queries
 * pause offline and refetch when the connection returns. Web uses the browser's
 * own online/offline events, which TanStack Query already handles.
 */
export function useOnlineManager(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    return NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null while unknown; treat that as online.
      onlineManager.setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
  }, []);
}
