import { describe, expect, it } from 'vitest';

import { isLaunchFlagOn } from './launch';

describe('isLaunchFlagOn', () => {
  it('is on for 1 and true', () => {
    expect(isLaunchFlagOn('1')).toBe(true);
    expect(isLaunchFlagOn('true')).toBe(true);
    expect(isLaunchFlagOn(' TRUE ')).toBe(true);
  });
  it('is off by default and for anything else', () => {
    expect(isLaunchFlagOn(undefined)).toBe(false);
    expect(isLaunchFlagOn('')).toBe(false);
    expect(isLaunchFlagOn('0')).toBe(false);
    expect(isLaunchFlagOn('false')).toBe(false);
    expect(isLaunchFlagOn('yes')).toBe(false);
  });
});
