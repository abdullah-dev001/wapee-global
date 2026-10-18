import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { planHistorySync } from '@/lib/history/stepHistory';

/**
 * Web only: give each step of an in-page flow a browser-history entry, so the
 * browser Back button (and Android Chrome's hardware Back) steps back through
 * the flow instead of leaving the page (QA F26). Native Android is handled by
 * `useOverlayDismiss` (BackHandler).
 *
 * `depth` is the current step's position (0 = first step). `onBack` is the
 * flow's own "one step back"; it may refuse (e.g. it first asks before
 * discarding a typed form), in which case the history stays where it was.
 *
 * The entries copy `history.state`, so Expo Router / React Navigation sees the
 * same route entry and does not navigate when they are popped.
 */
export function useWebStepHistory(depth: number, onBack: () => void): void {
  const pushed = useRef(0);
  const ignorePops = useRef(0);
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  // Bring the history in line with the step we are on.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const plan = planHistorySync(pushed.current, depth);
    if (plan.kind === 'push') {
      for (let i = 0; i < plan.count; i += 1) {
        window.history.pushState(window.history.state, '');
      }
      pushed.current += plan.count;
    } else if (plan.kind === 'back') {
      ignorePops.current += 1; // history.go(-n) fires ONE popstate
      pushed.current -= plan.count;
      window.history.go(-plan.count);
    }
  }, [depth]);

  // The user pressed Back: put the entry back (so a refused step-back leaves
  // the history untouched), then ask the flow to step back. If it does, the
  // effect above removes the entry again.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPop = () => {
      if (ignorePops.current > 0) {
        ignorePops.current -= 1;
        return;
      }
      if (pushed.current === 0) return; // at the first step: let the page go
      window.history.pushState(window.history.state, '');
      onBackRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
