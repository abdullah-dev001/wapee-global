import { describe, expect, it } from 'vitest';

import { formatDuration, sensibleUnitText } from './index';

describe('sensibleUnitText', () => {
  it('keeps a correct unit string', () => {
    expect(sensibleUnitText('30 min', 30, '30 min')).toBe('30 min');
    expect(sensibleUnitText('1 hr', 1, '1 h')).toBe('1 hr');
    // Localised numerals are fine: the check compares in the locale's own digits.
    expect(sensibleUnitText('٣٠ د', 30, '30 min', 'ar-EG')).toBe('٣٠ د');
  });
  it('replaces the Hermes seconds bug with the fallback', () => {
    expect(sensibleUnitText('1,800s', 30, '30 min')).toBe('30 min');
    expect(sensibleUnitText('5,400s', 90, '90 min')).toBe('90 min');
  });
});

describe('formatDuration', () => {
  it('formats minutes, hours and both', () => {
    expect(formatDuration(30, 'en')).toMatch(/30/);
    expect(formatDuration(60, 'en')).toMatch(/1/);
    expect(formatDuration(90, 'en')).toMatch(/1.*30/);
  });
});
