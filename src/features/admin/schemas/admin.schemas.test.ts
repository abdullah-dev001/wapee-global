import { describe, expect, it } from 'vitest';

import {
  assignPlanSchema,
  creditsSchema,
  extendTrialSchema,
  parseStarterFields,
  parseTerminology,
  periodEndToIso,
  planPricesSchema,
  presetSchema,
  removeReviewSchema,
  smsRateSchema,
  startersToText,
  terminologyToText,
} from './admin.schemas';

const ok = (r: { success: boolean }) => r.success;

describe('form schemas', () => {
  it('assign plan: plan required, optional date, note length', () => {
    expect(ok(assignPlanSchema.safeParse({ plan: 'team', periodEnd: '', notes: '' }))).toBe(true);
    expect(
      ok(assignPlanSchema.safeParse({ plan: 'team', periodEnd: '2027-01-31', notes: 'x' })),
    ).toBe(true);
    expect(ok(assignPlanSchema.safeParse({ plan: 'gold', periodEnd: '', notes: '' }))).toBe(false);
    expect(
      ok(assignPlanSchema.safeParse({ plan: 'solo', periodEnd: '31/01/2027', notes: '' })),
    ).toBe(false);
    expect(
      ok(assignPlanSchema.safeParse({ plan: 'solo', periodEnd: '', notes: 'x'.repeat(1001) })),
    ).toBe(false);
  });
  it('extend trial: 1..90 whole days', () => {
    for (const d of ['1', '90', '30'])
      expect(ok(extendTrialSchema.safeParse({ days: d }))).toBe(true);
    for (const d of ['0', '91', '-1', '1.5', '', 'ab'])
      expect(ok(extendTrialSchema.safeParse({ days: d }))).toBe(false);
  });
  it('credits: signed, whole, non-zero, bounded', () => {
    for (const a of ['500', '-50', '100000000'])
      expect(ok(creditsSchema.safeParse({ amount: a, note: '' }))).toBe(true);
    for (const a of ['0', '', '1.5', 'x', '100000001', '-100000001'])
      expect(ok(creditsSchema.safeParse({ amount: a, note: '' }))).toBe(false);
  });
  it('remove review: a real reason', () => {
    expect(ok(removeReviewSchema.safeParse({ reason: 'abusive' }))).toBe(true);
    expect(ok(removeReviewSchema.safeParse({ reason: ' a ' }))).toBe(false);
    expect(ok(removeReviewSchema.safeParse({ reason: 'x'.repeat(501) }))).toBe(false);
  });
  it('plan prices: currency is 3 letters', () => {
    const base = {
      name: 'Team',
      monthly: '39',
      annual: '380',
      currency: 'usd',
      active: true,
      pricedPerBranch: false,
    };
    expect(planPricesSchema.parse(base).currency).toBe('USD');
    expect(ok(planPricesSchema.safeParse({ ...base, currency: 'US' }))).toBe(false);
    expect(ok(planPricesSchema.safeParse({ ...base, monthly: '' }))).toBe(false);
  });
  it('sms rate: dial code, country, positive credits', () => {
    const base = { dial: '92', country: 'pk', credits: '55', note: '' };
    expect(smsRateSchema.parse(base).country).toBe('PK');
    for (const bad of [
      { dial: '0' },
      { dial: '+92' },
      { country: 'PAK' },
      { credits: '0' },
      { credits: '-3' },
    ]) {
      expect(ok(smsRateSchema.safeParse({ ...base, ...bad }))).toBe(false);
    }
  });
  it('preset: key and template format', () => {
    const base = {
      key: 'clinic',
      name: 'Clinic',
      templateKey: 'clinic',
      terminology: '',
      fields: '',
      active: true,
    };
    expect(ok(presetSchema.safeParse(base))).toBe(true);
    expect(ok(presetSchema.safeParse({ ...base, key: 'Bad Key' }))).toBe(false);
    expect(ok(presetSchema.safeParse({ ...base, templateKey: 'a-b' }))).toBe(false);
  });
});

describe('periodEndToIso', () => {
  it('turns a date into end of day UTC, empty into null', () => {
    expect(periodEndToIso('2027-01-31')).toBe('2027-01-31T23:59:59Z');
    expect(periodEndToIso('  ')).toBeNull();
  });
});

describe('parseTerminology', () => {
  it('parses term = Label lines and skips blanks', () => {
    expect(parseTerminology('client = Patient\n\nstaff = Doctor')).toEqual({
      ok: true,
      value: { client: 'Patient', staff: 'Doctor' },
    });
  });
  it('keeps "=" inside the label', () => {
    expect(parseTerminology('a = x = y')).toEqual({ ok: true, value: { a: 'x = y' } });
  });
  it('reports the failing line', () => {
    expect(parseTerminology('client = Patient\nBad Key = X')).toEqual({ ok: false, line: 2 });
    expect(parseTerminology('client =')).toEqual({ ok: false, line: 1 });
    expect(parseTerminology('no equals')).toEqual({ ok: false, line: 1 });
  });
});

describe('parseStarterFields', () => {
  it('parses the five types, required and options', () => {
    const r = parseStarterFields(
      'Allergies | long_text | required\nBlood group | dropdown | | A, B, AB, O\nPregnant | yes_no\nAge | number\nNickname | short_text',
    );
    expect(r).toEqual({
      ok: true,
      value: [
        { label: 'Allergies', field_type: 'long_text', is_required: true },
        { label: 'Blood group', field_type: 'dropdown', options: ['A', 'B', 'AB', 'O'] },
        { label: 'Pregnant', field_type: 'yes_no' },
        { label: 'Age', field_type: 'number' },
        { label: 'Nickname', field_type: 'short_text' },
      ],
    });
  });
  it('rejects unknown types, dropdowns with <2 options, options on other types', () => {
    expect(parseStarterFields('X | checkbox')).toEqual({ ok: false, line: 1 });
    expect(parseStarterFields('ok | short_text\nX | dropdown | | only')).toEqual({
      ok: false,
      line: 2,
    });
    expect(parseStarterFields('X | short_text | | a,b')).toEqual({ ok: false, line: 1 });
    expect(parseStarterFields(' | short_text')).toEqual({ ok: false, line: 1 });
  });
  it('round-trips through the text form', () => {
    const fields = [
      { label: 'Allergies', field_type: 'long_text', is_required: true },
      { label: 'Blood group', field_type: 'dropdown', options: ['A', 'B'] },
    ];
    expect(parseStarterFields(startersToText(fields))).toEqual({ ok: true, value: fields });
    expect(parseTerminology(terminologyToText({ client: 'Patient' }))).toEqual({
      ok: true,
      value: { client: 'Patient' },
    });
  });
});
