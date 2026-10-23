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
  /**
   * Self-service plan & add-on checkout (Polar) on the Owner billing screen, plus the
   * "Choose a plan" button on the trial-ended lock screen. Off unless the build sets
   * EXPO_PUBLIC_BILLING_CHECKOUT=1. Web/PWA only even when on — the native apps never show a
   * purchase UI (store policy). Must stay dot notation so Expo inlines it.
   */
  billingCheckout: isLaunchFlagOn(process.env.EXPO_PUBLIC_BILLING_CHECKOUT),
} as const;
