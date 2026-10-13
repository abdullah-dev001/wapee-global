import { describe, expect, it } from 'vitest';

import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('takes the first letter of the first and last name', () => {
    expect(initialsOf('Jane Doe')).toBe('JD');
  });

  it('takes a single letter for a one-word name', () => {
    expect(initialsOf('Jane')).toBe('J');
  });

  it('falls back to the email when there is no name', () => {
    expect(initialsOf('', 'jane@example.com')).toBe('J');
  });

  it('falls back to "?" when there is neither a name nor an email', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ', null)).toBe('?');
  });

  it('handles a non-Latin name by taking its own first characters as-is', () => {
    expect(initialsOf('محمد علي')).toBe('مع');
  });
});
