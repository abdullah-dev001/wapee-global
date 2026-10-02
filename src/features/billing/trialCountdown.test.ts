import { describe, expect, it } from 'vitest';

import { TRIAL_WARNING_DAYS, trialCountdown } from './trialCountdown';

/** A fixed "now" so these tests do not drift with the clock. */
const NOW = new Date('2026-10-02T12:00:00.000Z');

/** `hours` from NOW, as the ISO string the database returns. */
function inHours(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

describe('trialCountdown', () => {
  it('warns only inside the last 3 days', () => {
    expect(trialCountdown(inHours(24 * 5), 'trialing', NOW).shouldWarn).toBe(false);
    expect(trialCountdown(inHours(24 * 4), 'trialing', NOW).shouldWarn).toBe(false);
    // Exactly 3 days: the boundary is inclusive.
    expect(trialCountdown(inHours(24 * 3), 'trialing', NOW).shouldWarn).toBe(true);
    expect(trialCountdown(inHours(24 * 2), 'trialing', NOW).shouldWarn).toBe(true);
  });

  it('counts whole days left', () => {
    expect(trialCountdown(inHours(24 * 3), 'trialing', NOW).daysLeft).toBe(3);
    expect(trialCountdown(inHours(49), 'trialing', NOW).daysLeft).toBe(2);
    // 30 hours left is "tomorrow", not "in 1.25 days".
    expect(trialCountdown(inHours(30), 'trialing', NOW).daysLeft).toBe(1);
  });

  it('treats anything under 24 hours as the last day', () => {
    const almost = trialCountdown(inHours(23), 'trialing', NOW);
    expect(almost.daysLeft).toBe(0);
    expect(almost.isLastDay).toBe(true);
    expect(almost.shouldWarn).toBe(true);

    const minutes = trialCountdown(inHours(0.5), 'trialing', NOW);
    expect(minutes.isLastDay).toBe(true);
    expect(minutes.shouldWarn).toBe(true);
  });

  it('stops warning once the trial is over — the lock screen takes over', () => {
    expect(trialCountdown(inHours(-1), 'trialing', NOW).shouldWarn).toBe(false);
    expect(trialCountdown(inHours(-24 * 7), 'trialing', NOW).shouldWarn).toBe(false);
  });

  it('says nothing for a business that is not on trial', () => {
    // A paid business has no countdown even if trial_ends_at is still set.
    expect(trialCountdown(inHours(12), 'active', NOW).shouldWarn).toBe(false);
    expect(trialCountdown(inHours(12), 'suspended', NOW).shouldWarn).toBe(false);
    expect(trialCountdown(inHours(12), 'inactive', NOW).shouldWarn).toBe(false);
  });

  it('survives missing or malformed data', () => {
    expect(trialCountdown(null, 'trialing', NOW).shouldWarn).toBe(false);
    expect(trialCountdown(inHours(12), null, NOW).shouldWarn).toBe(false);
    expect(trialCountdown('not a date', 'trialing', NOW).shouldWarn).toBe(false);
  });

  it('warns for the whole window on a fresh 14-day trial only at the end', () => {
    // Day 1 of 14: silent. Day 11 onwards: warning.
    expect(trialCountdown(inHours(24 * 14), 'trialing', NOW).shouldWarn).toBe(false);
    expect(trialCountdown(inHours(24 * (TRIAL_WARNING_DAYS + 1)), 'trialing', NOW).shouldWarn).toBe(
      false,
    );
    expect(trialCountdown(inHours(24 * TRIAL_WARNING_DAYS), 'trialing', NOW).shouldWarn).toBe(true);
  });
});
