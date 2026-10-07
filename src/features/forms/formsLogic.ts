/**
 * Pure rules for Forms & Consent. The database is the authority (`validate_form_answers`,
 * `validate_signature`, `create_signed_consent`); these mirror it so a form can show the problem
 * before it is sent, and so the editor builds a template the server will accept.
 */

export const FIELD_TYPES = ['short_text', 'long_text', 'dropdown', 'yes_no', 'number'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const BLOCK_TYPES = ['heading', 'paragraph', 'bullet'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  help?: string | null;
  required: boolean;
  sensitive: boolean;
  options?: string[] | null;
};
export type FormBlock = { type: BlockType; text: string };

/** A stroke is a list of [x, y] points in 0..1 of the pad (the same space the server stores). */
export type Stroke = [number, number][];
export type Signature = Stroke[];

export type AnswerValue = string | number | boolean | null;
export type Answers = Record<string, AnswerValue>;

let counter = 0;
/** A short unique id for a new field (the server accepts [A-Za-z0-9_-]{1,40}). */
export function newFieldId(): string {
  counter += 1;
  return `f${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newField(type: FieldType = 'short_text'): FormField {
  return {
    id: newFieldId(),
    type,
    label: '',
    help: null,
    required: false,
    sensitive: false,
    options: type === 'dropdown' ? ['', ''] : null,
  };
}

/** First problem in an answer set, or null: the same rules as the server. */
export function answerProblem(
  fields: readonly FormField[],
  answers: Answers,
): { code: 'missing_answer' | 'invalid_answer'; fieldId: string } | null {
  for (const field of fields) {
    const value = answers[field.id];
    const empty =
      value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
    if (empty) {
      if (field.required) return { code: 'missing_answer', fieldId: field.id };
      continue;
    }
    if (field.type === 'yes_no' && typeof value !== 'boolean')
      return { code: 'invalid_answer', fieldId: field.id };
    if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      return { code: 'invalid_answer', fieldId: field.id };
    }
    if (field.type === 'short_text' || field.type === 'long_text' || field.type === 'dropdown') {
      if (typeof value !== 'string') return { code: 'invalid_answer', fieldId: field.id };
      const max = field.type === 'long_text' ? 5000 : 500;
      if (value.trim().length > max) return { code: 'invalid_answer', fieldId: field.id };
      if (field.type === 'dropdown' && !(field.options ?? []).includes(value.trim())) {
        return { code: 'invalid_answer', fieldId: field.id };
      }
    }
  }
  return null;
}

/** Drops empty answers so only what was filled in is sent. */
export function cleanAnswers(answers: Answers): Answers {
  const out: Answers = {};
  for (const [key, value] of Object.entries(answers)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

/** Is there any ink? (at least one stroke with a point) */
export function hasInk(signature: Signature | null | undefined): boolean {
  return Boolean(signature && signature.some((stroke) => stroke.length > 0));
}

/** Rounds to 4 decimals like the server, so what is shown is what is stored. */
export function roundPoint(x: number, y: number): [number, number] {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return [Math.round(clamp(x) * 10000) / 10000, Math.round(clamp(y) * 10000) / 10000];
}

/** SVG path for one stroke in the pad's 250 x 100 box. A single point becomes a dot. */
export const PAD_WIDTH = 250;
export const PAD_HEIGHT = 100;
export function strokePath(stroke: Stroke): string {
  if (stroke.length === 0) return '';
  const pts = stroke.map(
    ([x, y]) => `${(x * PAD_WIDTH).toFixed(1)} ${(y * PAD_HEIGHT).toFixed(1)}`,
  );
  if (pts.length === 1) return `M ${pts[0]} L ${pts[0]}`;
  return (
    `M ${pts[0]} ` +
    pts
      .slice(1)
      .map((p) => `L ${p}`)
      .join(' ')
  );
}

/** A template as the editor works with it. */
export type TemplateDraft = {
  kind: 'intake' | 'consent';
  title: string;
  requiresSignature: boolean;
  isActive: boolean;
  serviceIds: string[];
  body: FormBlock[];
  fields: FormField[];
};

/** Problems the editor can show before saving (the server checks again). */
export function draftProblem(draft: TemplateDraft): string | null {
  if (draft.title.trim().length < 1 || draft.title.trim().length > 120) return 'invalid_title';
  if (draft.fields.length > 40) return 'invalid_fields';
  for (const f of draft.fields) {
    if (f.label.trim().length < 1 || f.label.trim().length > 200) return 'invalid_field_label';
    if (f.type === 'dropdown') {
      const opts = (f.options ?? []).map((o) => o.trim());
      if (opts.length < 2 || opts.length > 50 || opts.some((o) => o === '' || o.length > 100))
        return 'invalid_options';
      if (new Set(opts).size !== opts.length) return 'invalid_options';
    }
  }
  if (
    draft.body.length > 100 ||
    draft.body.some((b) => b.text.trim() === '' || b.text.length > 2000)
  ) {
    return 'invalid_body';
  }
  return null;
}

export const FORM_ERROR_KEYS = {
  forbidden: 'forms.errors.forbidden',
  feature_unavailable: 'forms.errors.feature_unavailable',
  not_found: 'forms.errors.not_found',
  invalid_kind: 'forms.errors.invalid_kind',
  invalid_title: 'forms.errors.invalid_title',
  invalid_fields: 'forms.errors.invalid_fields',
  invalid_field_type: 'forms.errors.invalid_field_type',
  invalid_field_label: 'forms.errors.invalid_field_label',
  invalid_field_id: 'forms.errors.invalid_field_id',
  invalid_options: 'forms.errors.invalid_options',
  invalid_body: 'forms.errors.invalid_body',
  invalid_signature: 'forms.errors.invalid_signature',
  unknown_service: 'forms.errors.unknown_service',
  missing_answer: 'forms.errors.missing_answer',
  invalid_answer: 'forms.errors.invalid_answer',
  signature_required: 'forms.errors.signature_required',
  invalid_name: 'forms.errors.invalid_name',
  appointment_mismatch: 'forms.errors.appointment_mismatch',
  reason_required: 'forms.errors.reason_required',
  already_voided: 'forms.errors.already_voided',
  invalid_token: 'forms.errors.invalid_token',
  rate_limited: 'forms.errors.rate_limited',
  unknown: 'forms.errors.unknown',
} as const;

export type FormErrorCode = keyof typeof FORM_ERROR_KEYS;

export function formErrorKey(code: string | null): (typeof FORM_ERROR_KEYS)[FormErrorCode] {
  if (code && Object.prototype.hasOwnProperty.call(FORM_ERROR_KEYS, code)) {
    return FORM_ERROR_KEYS[code as FormErrorCode];
  }
  return FORM_ERROR_KEYS.unknown;
}
