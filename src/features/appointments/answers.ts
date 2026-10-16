/**
 * Booking-form answers (custom fields) as the dashboard shows them.
 *
 * Every answer row carries the `form_version_id` it was given under, and the
 * label / type / order come from THAT immutable snapshot (`form_versions.fields`),
 * never from today's `custom_fields`. So renaming or archiving a question later
 * never changes what an old booking shows.
 *
 * Visibility is the database's job: RLS returns only answers on appointments
 * the caller may see (Own / Branch / All) and hides sensitive answers without
 * `clients.view_sensitive` (suite 43). Nothing here filters.
 */

export type AnswerFieldType = 'short_text' | 'long_text' | 'dropdown' | 'yes_no' | 'number';

/** One raw `appointment_field_values` row (the columns the hooks select). */
export type RawAnswer = {
  id: string;
  custom_field_id: string;
  form_version_id: string;
  value: string | null;
  is_sensitive: boolean;
};

/** One field of a `form_versions.fields` snapshot (the keys this screen reads). */
export type SnapshotField = {
  id: string;
  label: string;
  field_type: AnswerFieldType;
  sort_order?: number | null;
};

export type AnswerRow = {
  id: string;
  /** Null when the snapshot has no such field (should not happen; shown with a fallback label). */
  label: string | null;
  type: AnswerFieldType | null;
  value: string;
  isSensitive: boolean;
};

/** `fields` is jsonb; anything that is not a well-formed field is ignored. */
export function parseSnapshotFields(fields: unknown): SnapshotField[] {
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (field): field is SnapshotField =>
      typeof field === 'object' &&
      field !== null &&
      typeof (field as SnapshotField).id === 'string' &&
      typeof (field as SnapshotField).label === 'string',
  );
}

/**
 * Joins answers to their own version's snapshot and orders them the way the
 * customer saw the form. Empty answers (an optional field left blank) are dropped.
 */
export function buildAnswerRows(
  answers: readonly RawAnswer[],
  snapshots: ReadonlyMap<string, readonly SnapshotField[]>,
): AnswerRow[] {
  const rows = answers
    .filter((answer) => answer.value !== null && answer.value.trim() !== '')
    .map((answer) => {
      const fields = snapshots.get(answer.form_version_id) ?? [];
      const index = fields.findIndex((field) => field.id === answer.custom_field_id);
      const field = index >= 0 ? fields[index] : undefined;
      return {
        row: {
          id: answer.id,
          label: field?.label ?? null,
          type: field?.field_type ?? null,
          value: answer.value ?? '',
          isSensitive: answer.is_sensitive,
        },
        order: field?.sort_order ?? (index >= 0 ? index : Number.MAX_SAFE_INTEGER),
      };
    });
  rows.sort((a, b) => a.order - b.order);
  return rows.map((entry) => entry.row);
}

/** A yes/no answer is stored as 'true' / 'false'; everything else is shown as typed. */
export function answerDisplayKind(row: Pick<AnswerRow, 'type' | 'value'>): 'yes' | 'no' | 'text' {
  if (row.type !== 'yes_no') return 'text';
  if (row.value === 'true') return 'yes';
  if (row.value === 'false') return 'no';
  return 'text';
}
