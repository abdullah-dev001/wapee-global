import { describe, expect, it } from 'vitest';

import {
  CSV_LABEL_KEYS,
  barWidth,
  csvCell,
  csvFileName,
  deltaBp,
  formatBp,
  formatDelta,
  sectionCsv,
  toCsv,
  trendOf,
} from './reportLogic';
import { type AppointmentsData, type RevenueData } from './reportTypes';

describe('deltaBp / trend / format', () => {
  it('is the relative change in basis points, null without a base', () => {
    expect(deltaBp(110, 100)).toBe(1000);
    expect(deltaBp(50, 100)).toBe(-5000);
    expect(deltaBp(0, 100)).toBe(-10000);
    expect(deltaBp(5, 0)).toBeNull();
  });
  it('trend direction', () => {
    expect(trendOf(1)).toBe('up');
    expect(trendOf(-1)).toBe('down');
    expect(trendOf(0)).toBe('flat');
    expect(trendOf(null)).toBe('none');
  });
  it('formats rates and deltas', () => {
    expect(formatBp(6364)).toBe('63.6%');
    expect(formatBp(null)).toBe('-');
    expect(formatDelta(1250)).toBe('+12.5%');
    expect(formatDelta(-300)).toBe('-3.0%');
    expect(formatDelta(0)).toBe('0.0%');
    expect(formatDelta(null)).toBe('-');
  });
  it('bar widths: proportional, never negative, tiny values stay visible', () => {
    expect(barWidth(50, 100)).toBe(50);
    expect(barWidth(0, 100)).toBe(0);
    expect(barWidth(-5, 100)).toBe(0);
    expect(barWidth(1, 1000)).toBe(3);
    expect(barWidth(5, 0)).toBe(0);
  });
});

describe('csv', () => {
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-3)).toBe('-3');
  });
  it('neutralises spreadsheet formulas in text', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell('-cmd')).toBe("'-cmd");
  });
  it('joins rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 1],
        ['b', 2],
      ]),
    ).toBe('a,1\r\nb,2');
  });
  it('file name carries the section and range', () => {
    expect(csvFileName('revenue', '2027-03-01', '2027-03-31')).toBe(
      'report-revenue-2027-03-01_2027-03-31.csv',
    );
  });
});

const labels = Object.fromEntries(CSV_LABEL_KEYS.map((k) => [k, k])) as Record<
  (typeof CSV_LABEL_KEYS)[number],
  string
>;

describe('sectionCsv', () => {
  it('revenue: one row per currency in plain major units, daily and method blocks, never merged', () => {
    const cur: RevenueData = {
      currencies: [
        {
          currency: 'GBP',
          invoiceCount: 2,
          invoicedMinor: 24000,
          creditedMinor: 0,
          taxMinor: 4000,
          netRevenueMinor: 20000,
          collectedMinor: 12345,
          discountsMinor: 500,
          discountedLines: 1,
          byMethod: [{ method: 'cash', amountMinor: 12345 }],
          daily: [{ date: '2027-03-01', netRevenueMinor: 20000, collectedMinor: 12345 }],
        },
        {
          currency: 'PKR',
          invoiceCount: 1,
          invoicedMinor: 5000,
          creditedMinor: 0,
          taxMinor: 0,
          netRevenueMinor: 5000,
          collectedMinor: 0,
          discountsMinor: 0,
          discountedLines: 0,
          byMethod: [],
          daily: [],
        },
      ],
    };
    const [gbp] = cur.currencies;
    if (!gbp) throw new Error('fixture');
    const prev: RevenueData = {
      currencies: [{ ...gbp, netRevenueMinor: 10000, collectedMinor: 9000 }],
    };
    const lines = sectionCsv('revenue', cur, prev, labels).split('\r\n');
    expect(lines[1]).toBe('GBP,2,240.00,0.00,40.00,200.00,100.00,123.45,90.00,5.00');
    // PKR has no minor unit: 5000 is 5000 rupees, and has no previous row -> 0
    expect(lines[2]).toBe('PKR,1,5000,0,0,5000,0,0,0,0');
    expect(lines).toContain('GBP,2027-03-01,200.00,123.45');
    expect(lines).toContain('GBP,cash,123.45');
  });
  it('appointments: counts and rates (percent numbers)', () => {
    const cur: AppointmentsData = {
      total: 10,
      pending: 0,
      confirmed: 1,
      completed: 6,
      cancelled: 2,
      noShow: 1,
      completedBp: 6000,
      cancelledBp: 2000,
      noShowBp: 1000,
    };
    const prev: AppointmentsData = {
      ...cur,
      total: 5,
      completed: 4,
      completedBp: 8000,
      cancelledBp: null,
    };
    const lines = sectionCsv('appointments', cur, prev, labels).split('\r\n');
    expect(lines[2]).toBe('completed,6,4,60,80');
    expect(lines[3]).toBe('cancelled,2,2,20,');
  });
});
