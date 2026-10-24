import { describe, expect, it } from 'vitest';

import {
  intentPlanKey,
  parsePlanParams,
  parseStoredIntent,
  PLAN_INTENT_TTL_MS,
  planIntentQuery,
  type PlanIntent,
} from './planIntent';

const NOW = new Date('2026-10-24T12:00:00.000Z').getTime();

/** Loosely typed on purpose: the tests feed it malformed values. */
function stored(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ plan: 'team', interval: 'year', source: 'link', savedAt: NOW, ...over });
}

describe('parsePlanParams', () => {
  it('reads a plan and interval', () => {
    expect(parsePlanParams('?plan=team&interval=year')).toEqual({ plan: 'team', interval: 'year' });
    expect(parsePlanParams('plan=solo&interval=month')).toEqual({ plan: 'solo', interval: 'month' });
  });

  it('defaults a missing or unknown interval to monthly', () => {
    expect(parsePlanParams('?plan=business')).toEqual({ plan: 'business', interval: 'month' });
    expect(parsePlanParams('?plan=team&interval=week')).toEqual({ plan: 'team', interval: 'month' });
    expect(parsePlanParams('?plan=team&interval=YEAR')).toEqual({ plan: 'team', interval: 'month' });
  });

  it('ignores a missing or malformed plan', () => {
    expect(parsePlanParams('')).toBeNull();
    expect(parsePlanParams('?interval=year')).toBeNull();
    expect(parsePlanParams('?plan=')).toBeNull();
    expect(parsePlanParams('?plan=Team')).toBeNull();
    expect(parsePlanParams('?plan=%3Cscript%3E')).toBeNull();
    expect(parsePlanParams('?plan=team%20plus')).toBeNull();
    expect(parsePlanParams('?plan=1team')).toBeNull();
    expect(parsePlanParams(`?plan=${'a'.repeat(33)}`)).toBeNull();
  });

  it('accepts any well-formed key; whether it is on sale is decided later', () => {
    expect(parsePlanParams('?plan=enterprise')?.plan).toBe('enterprise');
  });
});

describe('parseStoredIntent', () => {
  it('round-trips a fresh intent', () => {
    expect(parseStoredIntent(stored(), NOW)).toEqual({
      plan: 'team',
      interval: 'year',
      source: 'link',
      savedAt: NOW,
    });
  });

  it('expires after the TTL (inclusive edge kept)', () => {
    expect(parseStoredIntent(stored({ savedAt: NOW - PLAN_INTENT_TTL_MS }), NOW)).not.toBeNull();
    expect(parseStoredIntent(stored({ savedAt: NOW - PLAN_INTENT_TTL_MS - 1 }), NOW)).toBeNull();
  });

  it('refuses a future timestamp', () => {
    expect(parseStoredIntent(stored({ savedAt: NOW + 1 }), NOW)).toBeNull();
  });

  it('refuses anything malformed', () => {
    expect(parseStoredIntent(null, NOW)).toBeNull();
    expect(parseStoredIntent('', NOW)).toBeNull();
    expect(parseStoredIntent('not json', NOW)).toBeNull();
    expect(parseStoredIntent('null', NOW)).toBeNull();
    expect(parseStoredIntent('"team"', NOW)).toBeNull();
    expect(parseStoredIntent(stored({ plan: 'Team' }), NOW)).toBeNull();
    expect(parseStoredIntent(stored({ interval: 'week' }), NOW)).toBeNull();
    expect(parseStoredIntent(stored({ source: 'other' }), NOW)).toBeNull();
    expect(parseStoredIntent(stored({ savedAt: 'yesterday' }), NOW)).toBeNull();
  });
});

describe('planIntentQuery', () => {
  it('builds the query carried on the email link', () => {
    expect(planIntentQuery({ plan: 'team', interval: 'year' })).toBe('?plan=team&interval=year');
    expect(planIntentQuery(null)).toBe('');
  });

  it('round-trips through parsePlanParams', () => {
    expect(parsePlanParams(planIntentQuery({ plan: 'solo', interval: 'month' }))).toEqual({
      plan: 'solo',
      interval: 'month',
    });
  });
});

describe('intentPlanKey', () => {
  const plans = [{ key: 'solo' }, { key: 'team' }, { key: 'business' }];
  const intent = (plan: string): PlanIntent => ({
    plan,
    interval: 'month',
    source: 'link',
    savedAt: NOW,
  });

  it('returns the plan only when it is on sale', () => {
    expect(intentPlanKey(intent('team'), plans)).toBe('team');
    expect(intentPlanKey(intent('enterprise'), plans)).toBeNull();
    expect(intentPlanKey(null, plans)).toBeNull();
  });
});
