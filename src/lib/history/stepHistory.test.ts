import { describe, expect, it } from 'vitest';

import { planHistorySync } from './stepHistory';

describe('planHistorySync', () => {
  it('pushes one entry when the flow moves one step forward', () => {
    expect(planHistorySync(0, 1)).toEqual({ kind: 'push', count: 1 });
  });

  it('pushes several when the flow jumps forward', () => {
    expect(planHistorySync(1, 3)).toEqual({ kind: 'push', count: 2 });
  });

  it('goes back when the flow moved back in-page (its own Back button)', () => {
    expect(planHistorySync(3, 2)).toEqual({ kind: 'back', count: 1 });
  });

  it('collapses everything when the flow resets to the first step', () => {
    expect(planHistorySync(3, 0)).toEqual({ kind: 'back', count: 3 });
  });

  it('does nothing when already in step', () => {
    expect(planHistorySync(2, 2)).toEqual({ kind: 'none' });
  });

  it('never plans a negative depth', () => {
    expect(planHistorySync(0, -1)).toEqual({ kind: 'none' });
  });
});
