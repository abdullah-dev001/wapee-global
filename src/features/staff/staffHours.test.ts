import { describe, expect, it } from 'vitest';

import { hasNoWorkingHours } from './staffHours';

const base = { isActive: true, isBookableOnline: true, branchIds: ['b1'], hoursBranchIds: [] };

describe('hasNoWorkingHours', () => {
  it('warns for an active, online-bookable person at the branch with no hours', () => {
    expect(hasNoWorkingHours(base, 'b1')).toBe(true);
  });
  it('does not warn once the branch has hours', () => {
    expect(hasNoWorkingHours({ ...base, hoursBranchIds: ['b1'] }, 'b1')).toBe(false);
  });
  it('hours at another branch do not count', () => {
    expect(hasNoWorkingHours({ ...base, hoursBranchIds: ['b2'] }, 'b1')).toBe(true);
  });
  it('does not warn for inactive, not-online-bookable, unassigned or no branch', () => {
    expect(hasNoWorkingHours({ ...base, isActive: false }, 'b1')).toBe(false);
    expect(hasNoWorkingHours({ ...base, isBookableOnline: false }, 'b1')).toBe(false);
    expect(hasNoWorkingHours({ ...base, branchIds: ['b2'] }, 'b1')).toBe(false);
    expect(hasNoWorkingHours(base, null)).toBe(false);
  });
});
