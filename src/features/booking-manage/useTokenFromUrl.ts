import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';

import { parseTokenFromFragment, stripTokenFromUrl } from './tokenFragment';

type WindowWithFragment = Window & { __wapeeFragment?: string };

/**
 * Reads the manage token from the URL FRAGMENT and keeps it in memory only —
 * never localStorage/sessionStorage, never logged, never sent anywhere except
 * `manage_booking` (the confirmation screen's decision, carried over here:
 * booking-public-page.md).
 *
 * WEB: the fragment lives in `window.location.hash`, read synchronously at
 * mount (the lazy `useState` initializer, not an effect — it is not
 * subscribing to anything, just reading a value already present when this
 * component renders) and then stripped with `history.replaceState` as a
 * separate effect, so it never sits in the visible address bar, browser
 * history, or any referrer sent from this page.
 *
 * NATIVE: there is no address bar, but a deep link (`wapee://.../manage#token=...`)
 * can still carry a fragment, so the initial URL and any later `url` event are
 * both checked the same way — `expo-linking`'s parser keeps the fragment as a
 * query-shaped string.
 *
 * Returns `undefined` while still resolving (native's `getInitialURL` is
 * async), then the token or `null` if none was present.
 */
export function useTokenFromUrl(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return null;
    // The inline script in app/+html.tsx already moved the fragment out of the address bar; fall back to the address
    // itself (dev server, or a script blocked by a browser extension).
    const stashed = (window as WindowWithFragment).__wapeeFragment;
    return parseTokenFromFragment(stashed ?? window.location.hash);
  });
  // Guards a native async resolution against overwriting a token already
  // found by an earlier `url` event or the initial URL.
  const resolvedRef = useRef(Platform.OS === 'web');

  // Web: strip the fragment from the address bar. A side effect on an
  // external system (the browser's history), not a state subscription, so it
  // belongs in an effect even though the token itself was read synchronously.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!token || typeof window.history?.replaceState !== 'function') return;

    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);

    // Expo Router re-writes the address bar from its own saved URL (measured: it put `#token=`
    // back right after the strip above). So for as long as this page is mounted, any history
    // write is cleaned of the token before it reaches the address bar or the history.
    const history = window.history;
    const originalReplace = history.replaceState.bind(history);
    const originalPush = history.pushState.bind(history);
    const clean = (url: string | URL | null | undefined) =>
      url === null || url === undefined ? url : stripTokenFromUrl(String(url));
    history.replaceState = (state: unknown, title: string, url?: string | URL | null) =>
      originalReplace(state, title, clean(url));
    history.pushState = (state: unknown, title: string, url?: string | URL | null) =>
      originalPush(state, title, clean(url));
    return () => {
      history.replaceState = originalReplace;
      history.pushState = originalPush;
    };
  }, [token]);

  // Native: no fragment is available until a deep-link URL resolves.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let isMounted = true;

    const applyUrl = (url: string | null) => {
      if (!url || resolvedRef.current || !isMounted) return;
      const fragmentIndex = url.indexOf('#');
      const fragment = fragmentIndex >= 0 ? url.slice(fragmentIndex) : null;
      const found = parseTokenFromFragment(fragment);
      if (found) {
        resolvedRef.current = true;
        setToken(found);
      } else if (!resolvedRef.current) {
        setToken(null);
      }
    };

    ExpoLinking.getInitialURL()
      .then(applyUrl)
      .catch(() => {
        if (isMounted) setToken(null);
      });

    const subscription = ExpoLinking.addEventListener('url', (event) => applyUrl(event.url));

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return token;
}
