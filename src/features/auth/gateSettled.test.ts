import { describe, expect, it } from 'vitest';

import { showGateSpinner } from './gateSettled';

describe('showGateSpinner', () => {
  it('shows the spinner on the first load of a user', () => {
    expect(showGateSpinner(true, null, 'u1')).toBe(true);
  });

  it('shows nothing once loaded', () => {
    expect(showGateSpinner(false, null, 'u1')).toBe(false);
    expect(showGateSpinner(false, 'u1', 'u1')).toBe(false);
  });

  it('never replaces the app with a spinner after the gate settled for the same user (tab refocus)', () => {
    expect(showGateSpinner(true, 'u1', 'u1')).toBe(false);
  });

  it('shows the spinner again for a different user', () => {
    expect(showGateSpinner(true, 'u1', 'u2')).toBe(true);
  });
});
