import { describe, expect, it } from 'vitest';

import {
  currencyExponent,
  formatMinorAsMajor,
  formatMoney,
  money,
  parseMajorToMinor,
} from './index';

/**
 * Money. Every amount is an integer in minor units (CLAUDE.md §6) — a float bug
 * here silently corrupts invoices, so the parsing path is tested hard.
 */

describe('currencyExponent', () => {
  it('knows the common cases', () => {
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('GBP')).toBe(2);
    expect(currencyExponent('EUR')).toBe(2);
    expect(currencyExponent('INR')).toBe(2);
  });

  it('handles zero-decimal and three-decimal currencies', () => {
    // This is why the exponent is read from Intl and never assumed to be 2.
    // ¥100 is 100 minor units, not 10000.
    expect(currencyExponent('JPY')).toBe(0);
    // PKR has no minor unit in modern usage (ISO 4217) — and Pakistan is a
    // launch market, so getting this wrong would be a 100x pricing error.
    expect(currencyExponent('PKR')).toBe(0);
    expect(currencyExponent('IQD')).toBe(0);
    // Kuwaiti dinar and Bahraini dinar use three.
    expect(currencyExponent('KWD')).toBe(3);
    expect(currencyExponent('BHD')).toBe(3);
  });

  it('is case-insensitive and falls back safely', () => {
    expect(currencyExponent('usd')).toBe(2);
    expect(currencyExponent('ZZZ')).toBe(2);
  });
});

describe('parseMajorToMinor', () => {
  it('converts whole and decimal amounts', () => {
    expect(parseMajorToMinor('10', 'GBP', 'en-GB')).toBe(1000);
    expect(parseMajorToMinor('12.50', 'GBP', 'en-GB')).toBe(1250);
    expect(parseMajorToMinor('0.99', 'GBP', 'en-GB')).toBe(99);
    expect(parseMajorToMinor('0', 'GBP', 'en-GB')).toBe(0);
  });

  it('does not lose a penny to float arithmetic', () => {
    // 19.99 * 100 in floating point is 1998.9999999999998.
    expect(parseMajorToMinor('19.99', 'GBP', 'en-GB')).toBe(1999);
    expect(parseMajorToMinor('1.10', 'GBP', 'en-GB')).toBe(110);
    expect(parseMajorToMinor('0.07', 'GBP', 'en-GB')).toBe(7);
    expect(parseMajorToMinor('8.20', 'GBP', 'en-GB')).toBe(820);
  });

  it('pads a short fraction and truncates a long one', () => {
    expect(parseMajorToMinor('5.1', 'GBP', 'en-GB')).toBe(510);
    expect(parseMajorToMinor('5.', 'GBP', 'en-GB')).toBe(500);
    // Extra precision is dropped, never rounded up into a different price.
    expect(parseMajorToMinor('5.129', 'GBP', 'en-GB')).toBe(512);
  });

  it('handles a zero-decimal currency', () => {
    expect(parseMajorToMinor('1500', 'JPY', 'ja-JP')).toBe(1500);
    // A fraction is meaningless for JPY and is dropped.
    expect(parseMajorToMinor('1500.7', 'JPY', 'ja-JP')).toBe(1500);
    // PKR likewise: "2500" means 2500 rupees, stored as 2500.
    expect(parseMajorToMinor('2500', 'PKR', 'en-PK')).toBe(2500);
  });

  it('handles a three-decimal currency', () => {
    expect(parseMajorToMinor('1.500', 'KWD', 'ar-KW')).toBe(1500);
    expect(parseMajorToMinor('1.5', 'KWD', 'ar-KW')).toBe(1500);
  });

  it('ignores grouping separators and stray symbols', () => {
    expect(parseMajorToMinor('1,250.00', 'GBP', 'en-GB')).toBe(125000);
    expect(parseMajorToMinor('£12.50', 'GBP', 'en-GB')).toBe(1250);
    expect(parseMajorToMinor(' 12.50 ', 'GBP', 'en-GB')).toBe(1250);
  });

  it('follows the locale decimal separator', () => {
    // In de-DE "12,50" is twelve fifty and "." is grouping.
    expect(parseMajorToMinor('12,50', 'EUR', 'de-DE')).toBe(1250);
    expect(parseMajorToMinor('1.250,00', 'EUR', 'de-DE')).toBe(125000);
  });

  it('reads non-ASCII digits from an Arabic or Persian keypad', () => {
    // An ar-EG user types ١٢٫٥٠ on their own keypad. Stripping those digits
    // would turn a real price into null or a wrong amount.
    expect(parseMajorToMinor('١٢٫٥٠', 'EGP', 'ar-EG')).toBe(1250);
    expect(parseMajorToMinor('١٢٣', 'PKR', 'ar-EG')).toBe(123);
  });

  it('treats "." as grouping only where the locale does', () => {
    // de-DE groups with ".", so 1.500 is one thousand five hundred.
    expect(parseMajorToMinor('1.500', 'EUR', 'de-DE')).toBe(150000);
    // ar-KW groups with "٬" and decimates with "٫", so a keyboard "." is a
    // decimal point: 1.500 KWD is one and a half dinars, not 1500.
    expect(parseMajorToMinor('1.500', 'KWD', 'ar-KW')).toBe(1500);
  });

  it('returns null instead of guessing on bad input', () => {
    for (const bad of ['', '   ', 'abc', '.', '12.50.25']) {
      expect(parseMajorToMinor(bad, 'GBP', 'en-GB'), bad).toBeNull();
    }
  });

  it('keeps a leading minus (credit notes need negatives)', () => {
    expect(parseMajorToMinor('-12.50', 'GBP', 'en-GB')).toBe(-1250);
  });
});

describe('formatMinorAsMajor', () => {
  it('produces a plain editable string', () => {
    expect(formatMinorAsMajor(1250, 'GBP')).toBe('12.50');
    expect(formatMinorAsMajor(99, 'GBP')).toBe('0.99');
    expect(formatMinorAsMajor(7, 'GBP')).toBe('0.07');
    expect(formatMinorAsMajor(0, 'GBP')).toBe('0.00');
    expect(formatMinorAsMajor(125000, 'GBP')).toBe('1250.00');
  });

  it('omits the decimal point for zero-decimal currencies', () => {
    expect(formatMinorAsMajor(1500, 'JPY')).toBe('1500');
    expect(formatMinorAsMajor(2500, 'PKR')).toBe('2500');
  });

  it('uses three decimals where the currency does', () => {
    expect(formatMinorAsMajor(1500, 'KWD')).toBe('1.500');
  });

  it('keeps negatives', () => {
    expect(formatMinorAsMajor(-1250, 'GBP')).toBe('-12.50');
  });

  it('round-trips through parseMajorToMinor', () => {
    for (const currency of ['GBP', 'JPY', 'PKR', 'KWD']) {
      for (const minor of [0, 1, 7, 99, 100, 1250, 125000, 999999]) {
        const text = formatMinorAsMajor(minor, currency);
        expect(parseMajorToMinor(text, currency, 'en-GB'), `${currency} ${text}`).toBe(minor);
      }
    }
  });
});

describe('formatMoney', () => {
  it('shows the currency symbol for display', () => {
    expect(formatMoney(money(1250, 'GBP'), 'en-GB')).toMatch(/12\.50/);
    expect(formatMoney(money(1250, 'GBP'), 'en-GB')).toMatch(/£/);
  });

  it('formats a zero-decimal currency without decimals', () => {
    const result = formatMoney(money(1500, 'JPY'), 'ja-JP');
    expect(result).toMatch(/1,?500/);
    expect(result).not.toMatch(/1500\.00/);
  });

  it('does not throw on an unknown currency code', () => {
    expect(() => formatMoney(money(1000, 'ZZZ'), 'en-GB')).not.toThrow();
  });
});

describe('money', () => {
  it('refuses a non-integer, which would mean a float crept in', () => {
    expect(() => money(12.5, 'GBP')).toThrow();
    expect(() => money(Number.NaN, 'GBP')).toThrow();
  });

  it('normalises the currency code', () => {
    expect(money(100, 'gbp').currency).toBe('GBP');
  });
});
