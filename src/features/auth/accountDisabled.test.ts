import { describe, expect, it } from 'vitest';

import { isAccountDisabledError } from './accountDisabled';

describe('isAccountDisabledError', () => {
  it('matches the Auth hook message', () => {
    expect(
      isAccountDisabledError({ message: 'This account is disabled. Contact support@wapee.online' }),
    ).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isAccountDisabledError({ message: 'Invalid login credentials' })).toBe(false);
    expect(isAccountDisabledError(null)).toBe(false);
  });
});
