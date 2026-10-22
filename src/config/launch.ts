/**
 * A build-time launch flag (`EXPO_PUBLIC_*`, inlined by Expo at build time) is ON only for
 * `1` or `true`; unset, empty or anything else is OFF, so a production build without the
 * variable never shows the feature.
 */
export function isLaunchFlagOn(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

/**
 * Features that are built (code + database stay) but switched OFF at launch.
 * Flip a value to bring the feature back; no UI may promise a feature that is off here.
 */
export const launch = {
  /** Embeddable booking widget (website editor "Widget" tab). */
  widget: false,
  /** SMS messages and SMS credits (settings toggle, credits screen, hub card). */
  sms: false,
  /**
   * "Continue with Google" on login / signup. Off unless the build sets
   * EXPO_PUBLIC_GOOGLE_SIGNIN=1 (dev preview yes; production only once Google is set up there).
   * Must stay dot notation so Expo inlines it.
   */
  googleSignIn: isLaunchFlagOn(process.env.EXPO_PUBLIC_GOOGLE_SIGNIN),
} as const;
