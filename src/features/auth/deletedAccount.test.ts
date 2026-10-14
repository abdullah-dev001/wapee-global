import { describe, expect, it } from 'vitest';

import { isDeletedUserError } from './deletedAccount';

describe('isDeletedUserError', () => {
  it('matches the exact FK violation create_business_with_owner can raise', () => {
    expect(
      isDeletedUserError({
        code: '23503',
        message:
          'insert or update on table "businesses" violates foreign key constraint "businesses_created_by_fkey"',
        details: 'Key (created_by)=(…) is not present in table "profiles".',
      }),
    ).toBe(true);
  });

  it('matches when only details (not message) names the constraint', () => {
    expect(
      isDeletedUserError({
        code: '23503',
        message: 'insert or update on table "businesses" violates foreign key constraint',
        details: 'Key (created_by) is not present in table "profiles" — businesses_created_by_fkey',
      }),
    ).toBe(true);
  });

  it('is false for a different foreign-key violation', () => {
    expect(
      isDeletedUserError({
        code: '23503',
        message: 'violates foreign key constraint "branches_business_id_fkey"',
      }),
    ).toBe(false);
  });

  it('is false for a non-FK error, even with a matching message by coincidence', () => {
    expect(isDeletedUserError({ code: '23505', message: 'businesses_created_by_fkey' })).toBe(
      false,
    );
  });

  it('is false for null/undefined input', () => {
    expect(isDeletedUserError(null)).toBe(false);
    expect(isDeletedUserError(undefined)).toBe(false);
  });
});
