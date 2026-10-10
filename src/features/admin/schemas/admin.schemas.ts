import { z } from 'zod';

/**
 * Admin form schemas. Messages are i18n KEYS (FormField translates them). The
 * database validates everything again; these only give field-level feedback.
 * Values are strings because they come from text inputs; the `to…` helpers below
 * turn them into RPC arguments.
 */

const NOTE_MAX = 1000;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

export const PLAN_KEYS = ['solo', 'team', 'business'] as const;
export const ADMIN_STATUSES = ['active', 'inactive', 'suspended'] as const;
export const FIELD_TYPES = ['short_text', 'long_text', 'dropdown', 'yes_no', 'number'] as const;

export const assignPlanSchema = z.object({
  plan: z.enum(PLAN_KEYS, { error: 'admin.validation.planRequired' }),
  /** Optional, `YYYY-MM-DD`. Empty = no end date. */
  periodEnd: z
    .string()
    .trim()
    .refine((v) => v === '' || dateOnly.test(v), 'admin.validation.dateFormat'),
  notes: z.string().max(NOTE_MAX, 'admin.validation.noteTooLong'),
});
export type AssignPlanValues = z.infer<typeof assignPlanSchema>;

export const setStatusSchema = z.object({
  status: z.enum(ADMIN_STATUSES, { error: 'admin.validation.statusRequired' }),
  note: z.string().max(NOTE_MAX, 'admin.validation.noteTooLong'),
});
export type SetStatusValues = z.infer<typeof setStatusSchema>;

export const extendTrialSchema = z.object({
  days: z
    .string()
    .trim()
    .regex(/^\d+$/, 'admin.validation.daysRange')
    .refine((v) => Number(v) >= 1 && Number(v) <= 90, 'admin.validation.daysRange'),
});
export type ExtendTrialValues = z.infer<typeof extendTrialSchema>;

export const creditsSchema = z.object({
  /** Signed whole credits: a negative number is a correction. */
  amount: z
    .string()
    .trim()
    .regex(/^-?\d+$/, 'admin.validation.amountInteger')
    .refine(
      (v) => Number(v) !== 0 && Math.abs(Number(v)) <= 100_000_000,
      'admin.validation.amountRange',
    ),
  note: z.string().max(300, 'admin.validation.noteTooLong'),
});
export type CreditsValues = z.infer<typeof creditsSchema>;

export const removeReviewSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'admin.validation.reasonShort')
    .max(500, 'admin.validation.reasonLong'),
});
export type RemoveReviewValues = z.infer<typeof removeReviewSchema>;

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'admin.validation.currency');
const price = z.string().trim().min(1, 'admin.validation.priceRequired');

export const planPricesSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'admin.validation.nameRequired')
    .max(60, 'admin.validation.nameLong'),
  monthly: price,
  annual: price,
  currency,
  active: z.boolean(),
  pricedPerBranch: z.boolean(),
});
export type PlanPricesValues = z.infer<typeof planPricesSchema>;

export const addonPricesSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'admin.validation.nameRequired')
    .max(60, 'admin.validation.nameLong'),
  monthly: price,
  annual: price,
  currency,
  active: z.boolean(),
  /** Plans it can be bought on. None ticked = every plan. */
  plans: z.object({ solo: z.boolean(), team: z.boolean(), business: z.boolean() }),
});
export type AddonPricesValues = z.infer<typeof addonPricesSchema>;

export const smsRateSchema = z.object({
  dial: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{0,3}$/, 'admin.validation.dialCode'),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'admin.validation.countryCode'),
  credits: z
    .string()
    .trim()
    .regex(/^\d+$/, 'admin.validation.creditsPositive')
    .refine((v) => Number(v) > 0 && Number(v) <= 1_000_000, 'admin.validation.creditsPositive'),
  note: z.string().max(300, 'admin.validation.noteTooLong'),
});
export type SmsRateValues = z.infer<typeof smsRateSchema>;

export const presetSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,40}$/, 'admin.validation.presetKey'),
  name: z
    .string()
    .trim()
    .min(1, 'admin.validation.nameRequired')
    .max(80, 'admin.validation.nameLong'),
  templateKey: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,40}$/, 'admin.validation.templateKey'),
  /** One `term = Label` pair per line. */
  terminology: z.string().max(4000, 'admin.validation.noteTooLong'),
  /** One field per line: `Label | type | required | options,comma,separated`. */
  fields: z.string().max(8000, 'admin.validation.noteTooLong'),
  active: z.boolean(),
});
export type PresetValues = z.infer<typeof presetSchema>;

// ---------------------------------------------------------------------------
// Form text -> RPC arguments (pure, tested)
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` -> end of that day in UTC (`T23:59:59Z`), or null when empty. */
export function periodEndToIso(value: string): string | null {
  const v = value.trim();
  return v === '' ? null : `${v}T23:59:59Z`;
}

export type TerminologyParse =
  { ok: true; value: Record<string, string> } | { ok: false; line: number };

/** `client = Patient` per line. Blank lines are skipped; the first `=` splits. */
export function parseTerminology(text: string): TerminologyParse {
  const value: Record<string, string> = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = (lines[i] ?? '').trim();
    if (raw === '') continue;
    const eq = raw.indexOf('=');
    const key = eq > 0 ? raw.slice(0, eq).trim() : '';
    const label = eq > 0 ? raw.slice(eq + 1).trim() : '';
    if (!/^[a-z][a-z0-9_.]{0,40}$/.test(key) || label === '' || label.length > 80) {
      return { ok: false, line: i + 1 };
    }
    value[key] = label;
  }
  return { ok: true, value };
}

export type StarterField = {
  label: string;
  field_type: (typeof FIELD_TYPES)[number];
  is_required?: boolean;
  options?: string[];
};
export type FieldsParse = { ok: true; value: StarterField[] } | { ok: false; line: number };

/** `Label | type | required | a,b,c` per line (required and options are optional). */
export function parseStarterFields(text: string): FieldsParse {
  const out: StarterField[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = (lines[i] ?? '').trim();
    if (raw === '') continue;
    const [label = '', type = '', required = '', options = ''] = raw
      .split('|')
      .map((p) => p.trim());
    const fieldType = FIELD_TYPES.find((t) => t === type);
    if (label === '' || label.length > 120 || !fieldType) return { ok: false, line: i + 1 };
    const field: StarterField = { label, field_type: fieldType };
    if (required.toLowerCase() === 'required') field.is_required = true;
    if (fieldType === 'dropdown') {
      const list = options
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o !== '');
      if (list.length < 2) return { ok: false, line: i + 1 };
      field.options = list;
    } else if (options !== '') {
      return { ok: false, line: i + 1 };
    }
    out.push(field);
  }
  return { ok: true, value: out };
}

export function terminologyToText(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter((e): e is [string, string] => typeof e[1] === 'string')
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n');
}

export function startersToText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((f) => {
      if (typeof f !== 'object' || f === null) return [];
      const r = f as Record<string, unknown>;
      if (typeof r.label !== 'string' || typeof r.field_type !== 'string') return [];
      const options = Array.isArray(r.options)
        ? r.options.filter((o) => typeof o === 'string').join(', ')
        : '';
      return [
        [r.label, r.field_type, r.is_required === true ? 'required' : '', options].join(' | '),
      ];
    })
    .join('\n');
}
