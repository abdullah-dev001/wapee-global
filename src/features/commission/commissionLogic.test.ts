import { describe, expect, it } from 'vitest';

import {
  commissionErrorKey,
  currentRule,
  groupByStaff,
  isValidEffectiveFrom,
  ruleInputProblem,
  upcomingRule,
  type CommissionRule,
  type ReportRow,
} from './commissionLogic';

const rule = (over: Partial<CommissionRule>): CommissionRule => ({
  id: 'r',
  staffId: 's',
  serviceId: null,
  kind: 'percent',
  percentBp: 1000,
  flatMinor: null,
  currency: null,
  effectiveFrom: '2027-01-01',
  createdAt: '2027-01-01T00:00:00Z',
  ...over,
});

describe('currentRule', () => {
  const rules = [
    rule({ id: 'a', effectiveFrom: '2027-01-01', percentBp: 1000 }),
    rule({ id: 'b', effectiveFrom: '2027-03-01', percentBp: 2000 }),
    rule({ id: 'c', effectiveFrom: '2027-06-01', percentBp: 3000 }),
    rule({ id: 'd', serviceId: 'cut', effectiveFrom: '2027-02-01', percentBp: 500 }),
  ];
  it('is the latest version effective on or before today', () => {
    expect(currentRule(rules, null, '2027-03-15')?.id).toBe('b');
    expect(currentRule(rules, null, '2027-03-01')?.id).toBe('b');
    expect(currentRule(rules, null, '2027-02-28')?.id).toBe('a');
  });
  it('ignores versions that start in the future and other keys', () => {
    expect(currentRule(rules, null, '2026-12-31')).toBeNull();
    expect(currentRule(rules, 'cut', '2027-03-15')?.id).toBe('d');
    expect(currentRule(rules, 'colour', '2027-03-15')).toBeNull();
  });
  it('same effective date: the newer version wins', () => {
    const tie = [
      rule({ id: 'x', effectiveFrom: '2027-03-01', createdAt: '2027-03-01T08:00:00Z' }),
      rule({ id: 'y', effectiveFrom: '2027-03-01', createdAt: '2027-03-01T09:00:00Z' }),
    ];
    expect(currentRule(tie, null, '2027-03-02')?.id).toBe('y');
  });
  it('upcomingRule finds the next one still to start', () => {
    expect(upcomingRule(rules, null, '2027-03-15')?.id).toBe('c');
    expect(upcomingRule(rules, 'cut', '2027-03-15')).toBeNull();
  });
});

describe('ruleInputProblem', () => {
  it('validates percent and flat', () => {
    expect(ruleInputProblem({ kind: 'percent', percentBp: 1000 })).toBeNull();
    expect(ruleInputProblem({ kind: 'percent', percentBp: 10001 })).toBe('percent');
    expect(ruleInputProblem({ kind: 'percent', percentBp: 1.5 })).toBe('percent');
    expect(ruleInputProblem({ kind: 'flat', flatMinor: 500, currency: 'GBP' })).toBeNull();
    expect(ruleInputProblem({ kind: 'flat', flatMinor: -1, currency: 'GBP' })).toBe('flat');
    expect(ruleInputProblem({ kind: 'flat', flatMinor: 5, currency: 'gbp' })).toBe('flat');
    expect(ruleInputProblem({ kind: 'none' })).toBeNull();
  });
});

describe('isValidEffectiveFrom', () => {
  it('accepts real dates up to a year ahead, refuses the rest', () => {
    expect(isValidEffectiveFrom('2027-03-01', '2027-03-01')).toBe(true);
    expect(isValidEffectiveFrom('2027-02-30', '2027-03-01')).toBe(false);
    expect(isValidEffectiveFrom('2019-12-31', '2027-03-01')).toBe(false);
    expect(isValidEffectiveFrom('2029-01-01', '2027-03-01')).toBe(false);
    expect(isValidEffectiveFrom('soon', '2027-03-01')).toBe(false);
  });
});

describe('groupByStaff', () => {
  it('keeps each currency on its own row', () => {
    const rows: ReportRow[] = [
      {
        staffId: 's2',
        staffName: 'Zed',
        currency: 'GBP',
        earnedMinor: 1,
        reversedMinor: 0,
        netMinor: 1,
        invoiceCount: 1,
      },
      {
        staffId: 's1',
        staffName: 'Amy',
        currency: 'PKR',
        earnedMinor: 5,
        reversedMinor: 0,
        netMinor: 5,
        invoiceCount: 1,
      },
      {
        staffId: 's1',
        staffName: 'Amy',
        currency: 'GBP',
        earnedMinor: 2,
        reversedMinor: 1,
        netMinor: 1,
        invoiceCount: 1,
      },
    ];
    const grouped = groupByStaff(rows);
    expect(grouped.map((g) => g.staffName)).toEqual(['Amy', 'Zed']);
    expect(grouped[0]?.rows.map((r) => r.currency)).toEqual(['GBP', 'PKR']);
  });
});

describe('commissionErrorKey', () => {
  it('maps codes with a fallback', () => {
    expect(commissionErrorKey('invalid_flat')).toBe('commission.errors.invalid_flat');
    expect(commissionErrorKey('zzz')).toBe('commission.errors.unknown');
  });
});
