import { z } from 'zod';

/**
 * Validation for the custom-field editor.
 *
 * The database already enforces all of this (CHECK constraints, the dropdown
 * option shape, the enum of five types). These schemas exist so the owner is told
 * which field is wrong *before* a round trip, and the messages are i18n KEYS
 * rather than English so `FormField` can translate them (CLAUDE.md §8, §9).
 *
 * Kept in step with `20261003090000_booking_settings_and_form.sql`:
 *   label        1..120 chars
 *   help_text    0..300 chars
 *   dropdown     2..50 options, each non-empty, no nulls
 *   other types  no options at all
 */

/** Doc §6.1: exactly five types, no more. */
export const CUSTOM_FIELD_TYPES = [
  'short_text',
  'long_text',
  'dropdown',
  'yes_no',
  'number',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const MAX_DROPDOWN_OPTIONS = 50;
export const MIN_DROPDOWN_OPTIONS = 2;

export const customFieldSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, 'bookingFields.validation.labelRequired')
      .max(120, 'bookingFields.validation.labelTooLong'),
    fieldType: z.enum(CUSTOM_FIELD_TYPES),
    helpText: z
      .string()
      .trim()
      .max(300, 'bookingFields.validation.helpTooLong')
      // An empty box means "no help text", not an empty string.
      .transform((v) => (v.length === 0 ? null : v))
      .nullable(),
    isRequired: z.boolean(),
    isSensitive: z.boolean(),
    appliesToAllServices: z.boolean(),
    /** Only read when appliesToAllServices is false. */
    serviceIds: z.array(z.string().uuid()),
    /**
     * Kept as a single text area in the UI (one option per line) because adding
     * and reordering 20 rows of inputs is worse than editing a list, and the
     * owner can paste from a spreadsheet.
     */
    optionsText: z.string(),
  })
  .superRefine((value, ctx) => {
    const options = parseOptions(value.optionsText);

    if (value.fieldType === 'dropdown') {
      if (options.length < MIN_DROPDOWN_OPTIONS) {
        ctx.addIssue({
          code: 'custom',
          path: ['optionsText'],
          message: 'bookingFields.validation.optionsTooFew',
        });
      }
      if (options.length > MAX_DROPDOWN_OPTIONS) {
        ctx.addIssue({
          code: 'custom',
          path: ['optionsText'],
          message: 'bookingFields.validation.optionsTooMany',
        });
      }
      // A duplicate choice is not refused by the database but is certainly a
      // mistake: two identical options in a dropdown cannot be told apart, and
      // `create_booking` validates an answer by membership, so either would pass.
      if (new Set(options).size !== options.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['optionsText'],
          message: 'bookingFields.validation.optionsDuplicate',
        });
      }
    }

    // Choosing "selected services" and then selecting none would ask the question
    // on no service at all, which is almost certainly not what was meant.
    if (!value.appliesToAllServices && value.serviceIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceIds'],
        message: 'bookingFields.validation.servicesRequired',
      });
    }
  });

export type CustomFieldFormValues = z.input<typeof customFieldSchema>;

/**
 * One option per line, trimmed, blanks dropped.
 *
 * Exported and tested because it is the one piece of parsing between what the
 * owner types and what the database stores, and the DB refuses a null or empty
 * option outright.
 */
export function parseOptions(optionsText: string): string[] {
  return optionsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The reverse, for loading an existing field into the form. */
export function formatOptions(options: string[] | null): string {
  return (options ?? []).join('\n');
}

/**
 * Whether turning the sensitive flag OFF is allowed.
 *
 * It never is, once it has been on: `enforce_custom_field_guard` refuses it,
 * because the answers already captured were given under that promise and clearing
 * the flag would retroactively expose them. The UI needs to know so it can disable
 * the toggle and explain, rather than letting the owner try and get a 42501.
 */
export function canClearSensitive(wasSensitive: boolean): boolean {
  return !wasSensitive;
}
