import { describe, expect, it } from 'vitest';

import {
  answerProblem,
  cleanAnswers,
  draftProblem,
  formErrorKey,
  hasInk,
  newField,
  newFieldId,
  roundPoint,
  strokePath,
  type FormField,
  type TemplateDraft,
} from './formsLogic';

const fields: FormField[] = [
  { id: 'age', type: 'yes_no', label: 'Over 18', required: true, sensitive: false },
  {
    id: 'skin',
    type: 'dropdown',
    label: 'Skin',
    required: false,
    sensitive: false,
    options: ['Dry', 'Oily'],
  },
  { id: 'kg', type: 'number', label: 'Weight', required: false, sensitive: false },
  { id: 'note', type: 'long_text', label: 'Notes', required: false, sensitive: true },
];

describe('answerProblem (mirrors validate_form_answers)', () => {
  it('a required field must be answered; false is an answer', () => {
    expect(answerProblem(fields, {})).toEqual({ code: 'missing_answer', fieldId: 'age' });
    expect(answerProblem(fields, { age: false })).toBeNull();
  });
  it('rejects wrong types, a dropdown outside its options and an over-long text', () => {
    expect(answerProblem(fields, { age: 'yes' })).toEqual({
      code: 'invalid_answer',
      fieldId: 'age',
    });
    expect(answerProblem(fields, { age: true, skin: 'Green' })).toEqual({
      code: 'invalid_answer',
      fieldId: 'skin',
    });
    expect(answerProblem(fields, { age: true, kg: Number.NaN })).toEqual({
      code: 'invalid_answer',
      fieldId: 'kg',
    });
    expect(answerProblem(fields, { age: true, note: 'x'.repeat(5001) })).toEqual({
      code: 'invalid_answer',
      fieldId: 'note',
    });
    expect(answerProblem(fields, { age: true, skin: 'Dry', kg: 70, note: 'ok' })).toBeNull();
  });
});

describe('cleanAnswers', () => {
  it('drops empties and trims text but keeps false and 0', () => {
    expect(cleanAnswers({ a: '  hi ', b: '', c: null, d: false, e: 0 })).toEqual({
      a: 'hi',
      d: false,
      e: 0,
    });
  });
});

describe('signature helpers', () => {
  it('hasInk needs a stroke with a point', () => {
    expect(hasInk(null)).toBe(false);
    expect(hasInk([])).toBe(false);
    expect(hasInk([[]])).toBe(false);
    expect(hasInk([[[0.1, 0.2]]])).toBe(true);
  });
  it('rounds and clamps points like the server', () => {
    expect(roundPoint(0.123456, 1.4)).toEqual([0.1235, 1]);
    expect(roundPoint(-1, 0.5)).toEqual([0, 0.5]);
  });
  it('draws a stroke as an SVG path in the 250 x 100 box, a single point as a dot', () => {
    expect(
      strokePath([
        [0, 0],
        [1, 1],
      ]),
    ).toBe('M 0.0 0.0 L 250.0 100.0');
    expect(strokePath([[0.5, 0.5]])).toBe('M 125.0 50.0 L 125.0 50.0');
    expect(strokePath([])).toBe('');
  });
});

describe('draftProblem (mirrors save_form_template)', () => {
  const ok: TemplateDraft = {
    kind: 'consent',
    title: 'Consent',
    requiresSignature: true,
    isActive: true,
    serviceIds: [],
    body: [{ type: 'paragraph', text: 'I agree.' }],
    fields: [{ ...newField('short_text'), label: 'Name' }],
  };
  it('accepts a valid template', () => expect(draftProblem(ok)).toBeNull());
  it('refuses an empty title, an unlabeled field, bad dropdown options and blank body blocks', () => {
    expect(draftProblem({ ...ok, title: ' ' })).toBe('invalid_title');
    expect(draftProblem({ ...ok, fields: [newField()] })).toBe('invalid_field_label');
    expect(draftProblem({ ...ok, fields: [{ ...newField('dropdown'), label: 'x' }] })).toBe(
      'invalid_options',
    );
    expect(
      draftProblem({
        ...ok,
        fields: [{ ...newField('dropdown'), label: 'x', options: ['a', 'a'] }],
      }),
    ).toBe('invalid_options');
    expect(draftProblem({ ...ok, body: [{ type: 'paragraph', text: ' ' }] })).toBe('invalid_body');
  });
});

describe('ids and errors', () => {
  it('new field ids are unique and server-safe', () => {
    const a = newFieldId();
    const b = newFieldId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
  });
  it('maps codes with a fallback', () => {
    expect(formErrorKey('missing_answer')).toBe('forms.errors.missing_answer');
    expect(formErrorKey('toString')).toBe('forms.errors.unknown');
  });
});
