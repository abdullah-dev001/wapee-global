import { describe, expect, it } from 'vitest';

import {
  branchErrorKey,
  buildBranchPatch,
  formValuesFromBranch,
  isValidPrefix,
  parsePercentToBp,
  bpToPercentText,
  prefixLocked,
  resolveSelectedBranch,
  showSwitcher,
  totalsByCurrency,
  type BranchRow,
  type MyBranch,
} from './branchLogic';

const branch: BranchRow = {
  id: 'b1',
  name: 'Main',
  isPrimary: true,
  archived: false,
  countryCode: 'GB',
  currency: 'GBP',
  timezone: 'Europe/London',
  address: '1 High St',
  phone: null,
  taxNumber: null,
  taxRateBp: 2000,
  invoicePrefix: 'MAI',
  invoiceNextNo: 1,
};

describe('percent <-> basis points', () => {
  it('parses whole, fractional and comma percentages', () => {
    expect(parsePercentToBp('20')).toBe(2000);
    expect(parsePercentToBp('7.5')).toBe(750);
    expect(parsePercentToBp('7,25')).toBe(725);
    expect(parsePercentToBp('')).toBe(0);
    expect(parsePercentToBp('100')).toBe(10000);
  });
  it('refuses nonsense and values above 100', () => {
    expect(parsePercentToBp('101')).toBeNull();
    expect(parsePercentToBp('abc')).toBeNull();
    expect(parsePercentToBp('1.234')).toBeNull();
    expect(parsePercentToBp('-5')).toBeNull();
  });
  it('formats back without trailing noise', () => {
    expect(bpToPercentText(2000)).toBe('20');
    expect(bpToPercentText(750)).toBe('7.5');
    expect(bpToPercentText(725)).toBe('7.25');
  });
});

describe('buildBranchPatch', () => {
  const base = formValuesFromBranch(branch);
  it('is null when nothing changed', () => {
    expect(buildBranchPatch(branch, base)).toBeNull();
  });
  it('contains only the changed keys, in RPC naming', () => {
    expect(buildBranchPatch(branch, { ...base, name: ' Central ', taxRatePercent: '5' })).toEqual({
      name: 'Central',
      tax_rate_bp: 500,
    });
  });
  it('an emptied optional field is sent as null, a filled one as text', () => {
    expect(buildBranchPatch(branch, { ...base, address: '' })).toEqual({ address: null });
    expect(buildBranchPatch(branch, { ...base, phone: ' +44 1 ' })).toEqual({ phone: '+44 1' });
  });
  it('upper-cases the prefix', () => {
    expect(buildBranchPatch(branch, { ...base, invoicePrefix: 'ab1' })).toEqual({
      invoice_prefix: 'AB1',
    });
  });
  it('an invalid tax text does not produce a patch key', () => {
    expect(buildBranchPatch(branch, { ...base, taxRatePercent: 'x' })).toBeNull();
  });
});

describe('prefix', () => {
  it('validates the format', () => {
    expect(isValidPrefix('mai')).toBe(true);
    expect(isValidPrefix('A-1')).toBe(true);
    expect(isValidPrefix('-A')).toBe(false);
    expect(isValidPrefix('TOOLONGPREFIX')).toBe(false);
  });
  it('is locked once a number was issued', () => {
    expect(prefixLocked({ invoiceNextNo: 1 })).toBe(false);
    expect(prefixLocked({ invoiceNextNo: 2 })).toBe(true);
  });
});

describe('switcher', () => {
  const mine = (id: string, over: Partial<MyBranch> = {}): MyBranch => ({
    id,
    name: id,
    isPrimary: false,
    archived: false,
    countryCode: 'GB',
    currency: 'GBP',
    timezone: 'Europe/London',
    roles: [],
    ...over,
  });
  it('shows only with more than one live branch', () => {
    expect(showSwitcher([mine('a')])).toBe(false);
    expect(showSwitcher([mine('a'), mine('b', { archived: true })])).toBe(false);
    expect(showSwitcher([mine('a'), mine('b')])).toBe(true);
  });
  it('keeps a valid selection, else the primary, else the first', () => {
    const list = [mine('a'), mine('b', { isPrimary: true }), mine('c', { archived: true })];
    expect(resolveSelectedBranch(list, 'a')).toBe('a');
    expect(resolveSelectedBranch(list, 'c')).toBe('b');
    expect(resolveSelectedBranch(list, null)).toBe('b');
    expect(resolveSelectedBranch([], 'x')).toBeNull();
  });
});

describe('totalsByCurrency', () => {
  it('adds within a currency and NEVER across currencies', () => {
    const totals = totalsByCurrency([
      { currency: 'GBP', netRevenueMinor: 1000, collectedMinor: 900, invoiceCount: 2 },
      { currency: 'PKR', netRevenueMinor: 500000, collectedMinor: 0, invoiceCount: 1 },
      { currency: 'GBP', netRevenueMinor: 250, collectedMinor: 250, invoiceCount: 1 },
    ]);
    expect(totals).toEqual([
      {
        currency: 'GBP',
        netRevenueMinor: 1250,
        collectedMinor: 1150,
        invoiceCount: 3,
        branches: 2,
      },
      { currency: 'PKR', netRevenueMinor: 500000, collectedMinor: 0, invoiceCount: 1, branches: 1 },
    ]);
  });
});

describe('branchErrorKey', () => {
  it('maps every refusal code the RPCs return', () => {
    for (const code of [
      'future_appointments',
      'primary_branch',
      'prefix_locked',
      'currency_locked',
      'timezone_in_use',
      'website_uses_branch',
    ]) {
      expect(branchErrorKey(code)).toBe(`branches.errors.${code}`);
    }
    expect(branchErrorKey('???')).toBe('branches.errors.unknown');
  });
});
