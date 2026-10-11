# Offline screen
Last updated: 2026-10-20

## Current state
- `OfflineGate` (`src/components/layout/OfflineGate.tsx`) wraps the whole app in `app/_layout.tsx` (inside `ToastProvider`, around `SessionProvider`), so it covers the dashboard, auth and the PUBLIC booking pages. While offline it draws a full-screen overlay (`EmptyState`, WifiOff icon, "No internet connection", Retry button) above the still-mounted app; it disappears by itself when the connection returns. Nothing is cached or stored; the PWA shell cache (`public/sw.js`) is unchanged.
- `useNetworkStatus` (`src/lib/network`): web = `navigator.onLine` + `online` / `offline` events; native = NetInfo (`isConnected === false || isInternetReachable === false`; null = still unknown = online). Retry = `NetInfo.refresh()` (native) + a REAL request (`probeConnection`: `GET <supabase>/auth/v1/health`, `no-cors`, `no-store`, 6 s timeout); if the network answers the overlay hides even when the flag says offline. A second tap while checking is ignored.
- Strings: `offline.*` in `common.json`.

## Tests
`src/lib/network/probe.test.ts` (5). Playwright (system Chrome, `context.setOffline`) at 375 and 1440 on `/nova-hair-studio/book`: overlay appears, Retry while offline keeps it, going online hides it.

## Not done / traps
- A device with a flag "online" but no real internet (captive portal) is not detected until the user reaches the screen another way; only requests failing show their own error state.
- Native (Android / iOS) not run: reviewed in code. The underlying screen also shows its own error state with a second "Try again" while offline (expected; the overlay covers it).

## Changelog
- 2026-10-20: created.
