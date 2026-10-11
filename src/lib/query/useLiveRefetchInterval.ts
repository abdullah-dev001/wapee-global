import { useIsFocused } from 'expo-router';

import { LIVE_REFETCH_INTERVAL } from './staleTimes';

/**
 * `refetchInterval` for the two "live" screens (Today, Calendar): 30 s while the screen is focused,
 * off otherwise. TanStack also pauses the interval while the browser tab / app is in the background
 * (`refetchIntervalInBackground` stays false; focus comes from the document on web and `AppState` on
 * native, see `useAppFocusManager`). There is no push channel: this plus refetch-on-focus is the whole mechanism.
 */
export function useLiveRefetchInterval(live: boolean): number | false {
  const focused = useIsFocused();
  return live && focused ? LIVE_REFETCH_INTERVAL : false;
}
