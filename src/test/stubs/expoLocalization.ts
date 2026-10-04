/**
 * Stub for `expo-localization` in unit tests.
 *
 * The real package pulls in react-native (Flow syntax), which cannot load in
 * plain Node. `lib/time`'s `getDeviceTimeZone()` only reads `timeZone` off the
 * first calendar, so a placeholder returning the host's own zone is enough.
 */
export function getCalendars(): { timeZone: string | null }[] {
  return [{ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }];
}
