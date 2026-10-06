import { describe, expect, it } from 'vitest';

import {
  daysBetween,
  monthBounds,
  resolvePeriod,
  shiftMonth,
  stepAnchor,
  weekBounds,
} from './periodLogic';

describe('week', () => {
  it('Monday..Sunday for any day inside it', () => {
    expect(weekBounds('2027-03-10')).toEqual({ from: '2027-03-08', to: '2027-03-14' }); // Wed
    expect(weekBounds('2027-03-14')).toEqual({ from: '2027-03-08', to: '2027-03-14' }); // Sun
    expect(weekBounds('2027-03-15')).toEqual({ from: '2027-03-15', to: '2027-03-21' }); // Mon
  });
  it('previous week is the 7 days before', () => {
    expect(resolvePeriod('weekly', '2027-03-10')).toEqual({
      from: '2027-03-08',
      to: '2027-03-14',
      prevFrom: '2027-03-01',
      prevTo: '2027-03-07',
    });
  });
});

describe('month', () => {
  it('bounds incl. leap February', () => {
    expect(monthBounds('2027-03-15')).toEqual({ from: '2027-03-01', to: '2027-03-31' });
    expect(monthBounds('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('previous month crosses the year', () => {
    expect(resolvePeriod('monthly', '2027-01-31')).toEqual({
      from: '2027-01-01',
      to: '2027-01-31',
      prevFrom: '2026-12-01',
      prevTo: '2026-12-31',
    });
  });
  it('shiftMonth steps across year ends', () => {
    expect(shiftMonth('2027-01-15', -1)).toBe('2026-12-01');
    expect(shiftMonth('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftMonth('2027-03-31', 12)).toBe('2028-03-01');
  });
});

describe('custom', () => {
  it('previous equal period is the same number of days right before', () => {
    expect(resolvePeriod('custom', '2027-03-01', { from: '2027-03-02', to: '2027-03-03' })).toEqual(
      {
        from: '2027-03-02',
        to: '2027-03-03',
        prevFrom: '2027-02-28',
        prevTo: '2027-03-01',
      },
    );
  });
  it('refuses backwards and over 366 days; allows exactly 366', () => {
    expect(resolvePeriod('custom', '', { from: '2027-03-03', to: '2027-03-02' })).toBeNull();
    expect(resolvePeriod('custom', '', { from: '2027-01-01', to: '2028-01-02' })).toBeNull();
    expect(resolvePeriod('custom', '', { from: '2027-01-01', to: '2027-12-31' })).not.toBeNull();
    expect(resolvePeriod('custom', '2027-01-01')).toBeNull();
  });
  it('daysBetween', () => {
    expect(daysBetween('2027-03-01', '2027-03-31')).toBe(30);
  });
});

describe('stepAnchor', () => {
  it('steps weeks and months, leaves custom alone', () => {
    expect(stepAnchor('weekly', '2027-03-10', -1)).toBe('2027-03-03');
    expect(stepAnchor('monthly', '2027-03-10', 1)).toBe('2027-04-01');
    expect(stepAnchor('custom', '2027-03-10', 1)).toBe('2027-03-10');
  });
});
