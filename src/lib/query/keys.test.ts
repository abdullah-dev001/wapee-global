import { partialMatchKey } from '@tanstack/query-core';
import { describe, expect, it } from 'vitest';

import { createQueryKeys } from './keys';

describe('createQueryKeys.business', () => {
  const keys = createQueryKeys('products');
  const branchList = keys.list({ businessId: 'b1', branchId: 'br1', search: 'oil' });

  it('matches a list keyed by ANY branch of the business (so an invalidation reaches it)', () => {
    expect(partialMatchKey(branchList, keys.business('b1'))).toBe(true);
  });

  it('does not match another business', () => {
    expect(partialMatchKey(branchList, keys.business('b2'))).toBe(false);
  });

  it('documents the trap: scope({ businessId }) means branch null and misses a branch-keyed list', () => {
    expect(partialMatchKey(branchList, keys.scope({ businessId: 'b1' }))).toBe(false);
  });
});
