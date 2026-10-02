import { describe, expect, it } from 'vitest';

import { MINUTES_PER_DAY, formatDuration, formatMinuteOfDay, parseMinuteOfDay } from './index';

/**
 * Minute-of-day helpers. The schedule tables store recurring hours as minutes
 * from local midnight, so every hours editor round-trips through these — a bug
 * here silently shifts somebody's working day.
 */

describe('formatMinuteOfDay', () => {
  it('zero-pads so values sort and compare as strings', () => {
    expect(formatMinuteOfDay(0)).toBe('00:00');
    expect(formatMinuteOfDay(9 * 60)).toBe('09:00');
    expect(formatMinuteOfDay(9 * 60 + 5)).toBe('09:05');
    expect(formatMinuteOfDay(13 * 60 + 30)).toBe('13:30');
  });

  it('renders the end of the day as 24:00, not 00:00', () => {
    // end_minute = 1440 is a valid "closes at midnight"; wrapping to 00:00 would
    // make a full day look like a zero-length one.
    expect(formatMinuteOfDay(MINUTES_PER_DAY)).toBe('24:00');
  });

  it('clamps out-of-range input instead of producing nonsense', () => {
    expect(formatMinuteOfDay(-30)).toBe('00:00');
    expect(formatMinuteOfDay(5000)).toBe('24:00');
  });
});

describe('parseMinuteOfDay', () => {
  it('accepts padded and unpadded hours', () => {
    expect(parseMinuteOfDay('09:00')).toBe(540);
    expect(parseMinuteOfDay('9:00')).toBe(540);
    expect(parseMinuteOfDay('17:30')).toBe(1050);
    expect(parseMinuteOfDay('00:00')).toBe(0);
    expect(parseMinuteOfDay('24:00')).toBe(MINUTES_PER_DAY);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseMinuteOfDay('  09:15  ')).toBe(555);
  });

  it('returns null rather than guessing on bad input', () => {
    // Silently returning 0 would set someone's shift to midnight.
    for (const bad of ['', 'nine', '9', '09:60', '25:00', '24:01', '09:5', '-1:00', '09:00:00']) {
      expect(parseMinuteOfDay(bad), bad).toBeNull();
    }
  });

  it('round-trips with formatMinuteOfDay', () => {
    for (const minutes of [0, 1, 59, 60, 540, 721, 1050, 1439, MINUTES_PER_DAY]) {
      expect(parseMinuteOfDay(formatMinuteOfDay(minutes)), String(minutes)).toBe(minutes);
    }
  });
});

describe('formatDuration', () => {
  it('shows minutes under an hour', () => {
    expect(formatDuration(30, 'en-GB')).toMatch(/30/);
  });

  it('shows whole hours without a minutes part', () => {
    const result = formatDuration(120, 'en-GB');
    expect(result).toMatch(/2/);
    expect(result).not.toMatch(/\b0\b/);
  });

  it('shows hours and minutes together', () => {
    const result = formatDuration(90, 'en-GB');
    expect(result).toMatch(/1/);
    expect(result).toMatch(/30/);
  });

  it('never throws on odd input', () => {
    expect(() => formatDuration(0, 'en-GB')).not.toThrow();
    expect(() => formatDuration(-5, 'en-GB')).not.toThrow();
    expect(() => formatDuration(1440, 'ur-PK')).not.toThrow();
  });
});
