import { describe, expect, it } from 'vitest';

import {
  addonAvailability,
  addonOffered,
  compareRows,
  formatAmount,
  interpolate,
  parsePublicPricing,
  perMonthMinor,
  planChoiceHref,
  planHighlights,
  yearlyMonthsFree,
  type PublicPricing,
} from './pricingModel';

// Shaped like get_public_pricing(); the amounts are arbitrary test data.
const flags = (on: string[]) =>
  Object.fromEntries(
    [
      'core',
      'website',
      'reviews',
      'booking_link',
      'default_roles',
      'commission',
      'embed_widget',
      'advanced_reports',
      'custom_roles',
      'multi_branch',
      'branch_comparison',
    ].map((k) => [k, on.includes(k)]),
  );
const base = ['core', 'website', 'reviews', 'booking_link'];
const raw = {
  plans: [
    {
      key: 'solo',
      name: 'Solo',
      staff_cap: 1,
      max_branches: 1,
      priced_per_branch: false,
      features: flags(base),
      price_monthly_minor: 1000,
      price_annual_minor: 10000,
      currency: 'USD',
    },
    {
      key: 'team',
      name: 'Team',
      staff_cap: 5,
      max_branches: 1,
      priced_per_branch: false,
      features: flags([...base, 'default_roles', 'commission', 'embed_widget', 'advanced_reports']),
      price_monthly_minor: 2000,
      price_annual_minor: 20000,
      currency: 'USD',
    },
    {
      key: 'business',
      name: 'Business',
      staff_cap: null,
      max_branches: null,
      priced_per_branch: true,
      features: flags([
        ...base,
        'default_roles',
        'commission',
        'embed_widget',
        'advanced_reports',
        'custom_roles',
        'multi_branch',
        'branch_comparison',
      ]),
      price_monthly_minor: 3000,
      price_annual_minor: 30000,
      currency: 'USD',
    },
  ],
  addons: [
    {
      key: 'packages',
      name: 'Packages',
      available_plans: null,
      price_monthly_minor: 500,
      price_annual_minor: 5000,
      currency: 'USD',
    },
    {
      key: 'custom_roles',
      name: 'Custom roles',
      available_plans: ['team'],
      price_monthly_minor: 700,
      price_annual_minor: 7000,
      currency: 'USD',
    },
  ],
};

function data(): PublicPricing {
  const d = parsePublicPricing(raw);
  if (!d) throw new Error('fixture did not parse');
  return d;
}

describe('parsePublicPricing', () => {
  it('parses the RPC payload', () => {
    const d = data();
    expect(d.plans.map((p) => p.key)).toEqual(['solo', 'team', 'business']);
    expect(d.plans[2]).toMatchObject({ staffCap: null, maxBranches: null, perBranch: true });
    expect(d.addons[1]?.availablePlans).toEqual(['team']);
    expect(d.addons[0]?.availablePlans).toBeNull();
  });

  it('drops malformed rows and rejects a payload with no usable plan', () => {
    expect(parsePublicPricing(null)).toBeNull();
    expect(parsePublicPricing({ plans: [] })).toBeNull();
    expect(
      parsePublicPricing({
        plans: [
          { key: 'x', name: 'X', price_monthly_minor: 1.5, price_annual_minor: 1, currency: 'USD' },
        ],
      }),
    ).toBeNull();
    const d = parsePublicPricing({
      plans: [
        ...raw.plans,
        {
          key: 'bad',
          name: 'Bad',
          price_monthly_minor: -1,
          price_annual_minor: 0,
          currency: 'usd',
        },
      ],
      addons: 'nope',
    });
    expect(d?.plans).toHaveLength(3);
    expect(d?.addons).toEqual([]);
  });
});

describe('prices', () => {
  it('formats minor units with the currency, dropping .00', () => {
    expect(formatAmount(1500, 'USD', 'en')).toBe('$15');
    expect(formatAmount(1250, 'USD', 'en')).toBe('$12.50');
    expect(formatAmount(1500, 'JPY', 'en')).toBe('¥1,500');
  });

  it('yearly shows the annual price spread over 12 months', () => {
    const solo = data().plans[0];
    if (!solo) throw new Error('no plan');
    expect(perMonthMinor(solo, 'monthly')).toBe(1000);
    expect(perMonthMinor(solo, 'yearly')).toBe(833);
  });

  it('months free is computed from the data, and only when every plan agrees', () => {
    expect(yearlyMonthsFree(data().plans)).toBe(2);
    expect(
      yearlyMonthsFree([
        { monthlyMinor: 1000, annualMinor: 10000 },
        { monthlyMinor: 1000, annualMinor: 11000 },
      ]),
    ).toBeNull();
    expect(yearlyMonthsFree([{ monthlyMinor: 1000, annualMinor: 12000 }])).toBeNull();
  });
});

describe('what each plan includes (from the gating flags)', () => {
  it('never advertises default_roles: it is a flag nothing enforces, so it is no plan difference', () => {
    const d = data();
    for (let i = 0; i < d.plans.length; i += 1) {
      expect(planHighlights(d.plans, i).features).not.toContain('default_roles');
    }
  });

  it('first plan lists everything; next plans list only what they add', () => {
    const d = data();
    expect(planHighlights(d.plans, 0)).toEqual({
      inheritsFrom: null,
      features: ['booking_link', 'core', 'website', 'reviews'],
    });
    expect(planHighlights(d.plans, 1)).toEqual({
      inheritsFrom: 'Solo',
      features: ['commission', 'advanced_reports'],
    });
    expect(planHighlights(d.plans, 2).features).toEqual([
      'custom_roles',
      'multi_branch',
      'branch_comparison',
    ]);
  });

  it('never advertises the embed widget (off at launch), even when a plan flags it', () => {
    const d = data();
    const all = d.plans.flatMap((_, i) => planHighlights(d.plans, i).features as string[]);
    expect(all).not.toContain('embed_widget');
    expect(compareRows(d.plans, d.addons).map((r) => r.key)).not.toContain('embed_widget');
  });

  it('custom roles: not on Solo, add-on on Team, included in Business', () => {
    const d = data();
    const row = compareRows(d.plans, d.addons).find((r) => r.key === 'custom_roles');
    expect(row?.cells).toEqual(['no', 'addon', 'yes']);
    const addon = d.addons[1];
    if (!addon) throw new Error('no addon');
    expect(d.plans.map((p) => addonOffered(addon, p))).toEqual([false, true, false]);
    expect(addonAvailability(addon, d.plans)).toEqual({
      onlyOn: ['Team'],
      includedIn: ['Business'],
    });
  });

  it('an add-on on every plan is an add-on row everywhere', () => {
    const d = data();
    expect(compareRows(d.plans, d.addons).find((r) => r.key === 'packages')).toEqual({
      key: 'packages',
      label: 'Packages',
      cells: ['addon', 'addon', 'addon'],
    });
    const packages = d.addons[0];
    if (!packages) throw new Error('no addon');
    expect(addonAvailability(packages, d.plans)).toEqual({ onlyOn: null, includedIn: [] });
  });
});

describe('interpolate', () => {
  it('fills known placeholders and leaves unknown ones', () => {
    expect(interpolate('{{a}} and {{b}}', { a: 1 })).toBe('1 and {{b}}');
  });
});

describe('planChoiceHref', () => {
  it('carries the plan and the toggle as the app expects (month | year)', () => {
    expect(planChoiceHref('/signup', 'team', 'monthly')).toBe('/signup?plan=team&interval=month');
    expect(planChoiceHref('/signup', 'business', 'yearly')).toBe(
      '/signup?plan=business&interval=year',
    );
    expect(planChoiceHref('/settings/billing', 'solo', 'yearly')).toBe(
      '/settings/billing?plan=solo&interval=year',
    );
  });

  it('encodes the key', () => {
    expect(planChoiceHref('/signup', 'a&b', 'monthly')).toBe('/signup?plan=a%26b&interval=month');
  });
});
