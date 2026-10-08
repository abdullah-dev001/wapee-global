import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { isOfflineState, probeConnection } from './probe';

export type NetworkStatus = {
  offline: boolean;
  /** A retry request is running. */
  checking: boolean;
  /** Makes a real request; hides the offline state when it succeeds. */
  retry: () => Promise<void>;
};

/**
 * Device connectivity for the offline screen. Web: `navigator.onLine` + the `online` / `offline`
 * events. Native: NetInfo. Nothing is stored; the answer only lives in memory.
 */
export function useNetworkStatus(): NetworkStatus {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      const update = () => setOffline(!navigator.onLine);
      update();
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      return () => {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      };
    }
    return NetInfo.addEventListener((state) => setOffline(isOfflineState(state)));
  }, []);

  const retry = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      if (Platform.OS !== 'web') await NetInfo.refresh().catch(() => undefined);
      // The real request decides: if the network answers, we are online whatever the flag says.
      if (await probeConnection()) setOffline(false);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);

  return { offline, checking, retry };
}
