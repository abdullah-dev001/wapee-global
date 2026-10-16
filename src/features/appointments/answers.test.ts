import { describe, expect, it } from 'vitest';

import {
  answerDisplayKind,
  buildAnswerRows,
  parseSnapshotFields,
  type RawAnswer,
  type SnapshotField,
} from './answers';

const V1: SnapshotField[] = [
  { id: 'f-allergy', label: 'Any allergies?', field_type: 'yes_no', sort_order: 2 },
  { id: 'f-name', label: 'Preferred name', field_type: 'short_text', sort_order: 1 },
];
// Version 2 renamed the question. An answer given under v1 must keep v1's label.
const V2: SnapshotField[] = [
  { id: 'f-name', label: 'What should we call you?', field_type: 'short_text', sort_order: 1 },
];

const snapshots = new Map<string, SnapshotField[]>([
  ['v1', V1],
  ['v2', V2],
]);

function answer(partial: Partial<RawAnswer>): RawAnswer {
  return {
    id: 'a',
    custom_field_id: 'f-name',
    form_version_id: 'v1',
    value: 'Sam',
    is_sensitive: false,
    ...partial,
  };
}

describe('buildAnswerRows', () => {
  it('labels each answer from ITS OWN form version, not the latest one', () => {
    const rows = buildAnswerRows([answer({ form_version_id: 'v1' })], snapshots);
    expect(rows[0]?.label).toBe('Preferred name');
    const newer = buildAnswerRows([answer({ form_version_id: 'v2' })], snapshots);
    expect(newer[0]?.label).toBe('What should we call you?');
  });

  it('orders answers as the form showed them (snapshot sort_order)', () => {
    const rows = buildAnswerRows(
      [
        answer({ id: 'a1', custom_field_id: 'f-allergy', value: 'true' }),
        answer({ id: 'a2', custom_field_id: 'f-name', value: 'Sam' }),
      ],
      snapshots,
    );
    expect(rows.map((row) => row.id)).toEqual(['a2', 'a1']);
  });

  it('drops blank optional answers', () => {
    expect(buildAnswerRows([answer({ value: '  ' }), answer({ value: null })], snapshots)).toEqual(
      [],
    );
  });

  it('keeps the sensitive flag from the answer row', () => {
    const rows = buildAnswerRows([answer({ is_sensitive: true })], snapshots);
    expect(rows[0]?.isSensitive).toBe(true);
  });

  it('falls back to a null label when the snapshot has no such field', () => {
    const rows = buildAnswerRows([answer({ custom_field_id: 'gone' })], snapshots);
    expect(rows[0]).toMatchObject({ label: null, type: null, value: 'Sam' });
  });
});

describe('parseSnapshotFields', () => {
  it('ignores malformed jsonb', () => {
    expect(parseSnapshotFields(null)).toEqual([]);
    expect(parseSnapshotFields({})).toEqual([]);
    expect(parseSnapshotFields([{ id: 1 }, { id: 'x', label: 'X', field_type: 'number' }])).toEqual(
      [{ id: 'x', label: 'X', field_type: 'number' }],
    );
  });
});

describe('answerDisplayKind', () => {
  it('turns stored yes/no into Yes / No, leaves other types as typed', () => {
    expect(answerDisplayKind({ type: 'yes_no', value: 'true' })).toBe('yes');
    expect(answerDisplayKind({ type: 'yes_no', value: 'false' })).toBe('no');
    expect(answerDisplayKind({ type: 'number', value: 'true' })).toBe('text');
    expect(answerDisplayKind({ type: null, value: 'x' })).toBe('text');
  });
});
