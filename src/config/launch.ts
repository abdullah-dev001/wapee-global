/**
 * Features that are built (code + database stay) but switched OFF at launch.
 * Flip a value to bring the feature back; no UI may promise a feature that is off here.
 */
export const launch = {
  /** Embeddable booking widget (website editor "Widget" tab). */
  widget: false,
  /** SMS messages and SMS credits (settings toggle, credits screen, hub card). */
  sms: false,
} as const;
