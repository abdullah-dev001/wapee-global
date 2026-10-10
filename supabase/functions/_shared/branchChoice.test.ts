import { describe, expect, it } from 'vitest';

import { chooseBranch, type BookableBranch } from './branchChoice.ts';

const branch = (id: string, code: string, isPrimary = false): BookableBranch => ({
  id,
  name: `Branch ${code}`,
  address: null,
  timezone: 'UTC',
  currency: 'USD',
  countryCode: 'US',
  isPrimary,
  code,
});

const A = branch('11111111-1111-4111-8111-111111111111', 'DT', true);
const B = branch('22222222-2222-4222-8222-222222222222', 'UP');

describe('chooseBranch', () => {
  it('reports "none" when nothing is bookable', () => {
    expect(chooseBranch([], null)).toEqual({ kind: 'none' });
    expect(chooseBranch([], A.id)).toEqual({ kind: 'none' });
  });

  it('picks the only bookable branch without a reference (old links keep working)', () => {
    expect(chooseBranch([B], null)).toEqual({ kind: 'one', branch: B });
  });

  it('asks the customer to choose when there are two or more and no reference', () => {
    expect(chooseBranch([A, B], null)).toEqual({ kind: 'choose', branches: [A, B] });
    expect(chooseBranch([A, B], '   ')).toEqual({ kind: 'choose', branches: [A, B] });
  });

  it('preselects by id or by short code, ignoring case', () => {
    expect(chooseBranch([A, B], B.id)).toEqual({ kind: 'one', branch: B });
    expect(chooseBranch([A, B], 'up')).toEqual({ kind: 'one', branch: B });
    expect(chooseBranch([A, B], B.id.toUpperCase())).toEqual({ kind: 'one', branch: B });
  });

  it('treats an unknown reference like no reference (never an error)', () => {
    expect(chooseBranch([A, B], '33333333-3333-4333-8333-333333333333')).toEqual({
      kind: 'choose',
      branches: [A, B],
    });
    expect(chooseBranch([A], 'ZZ')).toEqual({ kind: 'one', branch: A });
  });
});
