import { describe, expect, it } from 'vitest';

import { pickBelowTeamSize, teamSizeOptions, type TeamSizeOption } from './suggestPlan';

const SOLO = { key: 'solo', staffCap: 1 };
const TEAM = { key: 'team', staffCap: 5 };
const BUSINESS = { key: 'business', staffCap: null };
const PLANS = [SOLO, TEAM, BUSINESS];

describe('teamSizeOptions', () => {
  it('turns staff caps into one band per plan', () => {
    expect(teamSizeOptions(PLANS)).toEqual([
      { planKey: 'solo', min: 1, max: 1 },
      { planKey: 'team', min: 2, max: 5 },
      { planKey: 'business', min: 6, max: null },
    ]);
  });

  it('sorts by cap whatever the catalogue order', () => {
    expect(teamSizeOptions([BUSINESS, SOLO, TEAM]).map((o) => o.planKey)).toEqual([
      'solo',
      'team',
      'business',
    ]);
  });

  it('skips a plan that adds no staff over a cheaper one', () => {
    expect(
      teamSizeOptions([
        { key: 'solo', staffCap: 1 },
        { key: 'solo_plus', staffCap: 1 },
        { key: 'team', staffCap: 5 },
      ]),
    ).toEqual([
      { planKey: 'solo', min: 1, max: 1 },
      { planKey: 'team', min: 2, max: 5 },
    ]);
  });

  it('keeps only the first unlimited plan', () => {
    expect(
      teamSizeOptions([
        { key: 'team', staffCap: 5 },
        { key: 'business', staffCap: null },
        { key: 'enterprise', staffCap: null },
      ]).map((o) => o.planKey),
    ).toEqual(['team', 'business']);
  });

  it('handles no plans', () => {
    expect(teamSizeOptions([])).toEqual([]);
  });
});

describe('pickBelowTeamSize', () => {
  const solo: TeamSizeOption = { planKey: 'solo', min: 1, max: 1 };
  const team: TeamSizeOption = { planKey: 'team', min: 2, max: 5 };
  const business: TeamSizeOption = { planKey: 'business', min: 6, max: null };

  it('flags a landing pick too small for the answer', () => {
    expect(pickBelowTeamSize(PLANS, 'solo', team)?.key).toBe('solo');
    expect(pickBelowTeamSize(PLANS, 'team', business)?.key).toBe('team');
  });

  it('stays quiet when the pick fits', () => {
    expect(pickBelowTeamSize(PLANS, 'team', solo)).toBeNull();
    expect(pickBelowTeamSize(PLANS, 'team', team)).toBeNull();
    expect(pickBelowTeamSize(PLANS, 'business', business)).toBeNull();
  });

  it('stays quiet with no pick, no answer, or an unknown pick', () => {
    expect(pickBelowTeamSize(PLANS, null, business)).toBeNull();
    expect(pickBelowTeamSize(PLANS, 'solo', null)).toBeNull();
    expect(pickBelowTeamSize(PLANS, 'enterprise', business)).toBeNull();
  });
});
