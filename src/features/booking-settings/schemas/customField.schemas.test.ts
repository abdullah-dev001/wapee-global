import { describe, expect, it } from 'vitest';

import {
  canClearSensitive,
  customFieldSchema,
  formatOptions,
  parseOptions,
  type CustomFieldFormValues,
} from './customField.schemas';

function valid(overrides: Partial<CustomFieldFormValues> = {}): CustomFieldFormValues {
  return {
    label: 'Any allergies?',
    fieldType: 'short_text',
    helpText: null,
    isRequired: false,
    isSensitive: false,
    appliesToAllServices: true,
    serviceIds: [],
    optionsText: '',
    ...overrides,
  };
}

/** The first issue's message for a given path, or undefined. */
function issueFor(values: CustomFieldFormValues, path: string): string | undefined {
  const result = customFieldSchema.safeParse(values);
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path.join('.') === path)?.message;
}

describe('parseOptions', () => {
  it('splits on newlines and trims', () => {
    expect(parseOptions('Short\nMedium\nLong')).toEqual(['Short', 'Medium', 'Long']);
    expect(parseOptions('  Short  \n  Long  ')).toEqual(['Short', 'Long']);
  });

  it('drops blank lines, which the DB would refuse', () => {
    // custom_fields_options_shape rejects a null or empty option outright.
    expect(parseOptions('Short\n\n\nLong\n')).toEqual(['Short', 'Long']);
    expect(parseOptions('\n  \n')).toEqual([]);
  });

  it('round-trips with formatOptions', () => {
    const options = ['Short', 'Medium', 'Long'];
    expect(parseOptions(formatOptions(options))).toEqual(options);
  });

  it('formats null as an empty string', () => {
    expect(formatOptions(null)).toBe('');
  });
});

describe('customFieldSchema', () => {
  it('accepts a minimal valid field', () => {
    expect(customFieldSchema.safeParse(valid()).success).toBe(true);
  });

  it('requires a label', () => {
    expect(issueFor(valid({ label: '' }), 'label')).toBe('bookingFields.validation.labelRequired');
    expect(issueFor(valid({ label: '   ' }), 'label')).toBe(
      'bookingFields.validation.labelRequired',
    );
  });

  it('caps the label at the DB limit of 120', () => {
    expect(issueFor(valid({ label: 'a'.repeat(121) }), 'label')).toBe(
      'bookingFields.validation.labelTooLong',
    );
    expect(customFieldSchema.safeParse(valid({ label: 'a'.repeat(120) })).success).toBe(true);
  });

  it('caps help text at the DB limit of 300', () => {
    expect(issueFor(valid({ helpText: 'a'.repeat(301) }), 'helpText')).toBe(
      'bookingFields.validation.helpTooLong',
    );
  });

  it('turns empty help text into null, not an empty string', () => {
    const result = customFieldSchema.parse(valid({ helpText: '   ' }));
    expect(result.helpText).toBeNull();
  });

  describe('dropdown options', () => {
    const dropdown = (optionsText: string) => valid({ fieldType: 'dropdown', optionsText });

    it('needs at least 2, as the DB requires', () => {
      expect(issueFor(dropdown('Only one'), 'optionsText')).toBe(
        'bookingFields.validation.optionsTooFew',
      );
      expect(issueFor(dropdown(''), 'optionsText')).toBe('bookingFields.validation.optionsTooFew');
      expect(customFieldSchema.safeParse(dropdown('One\nTwo')).success).toBe(true);
    });

    it('allows at most 50, as the DB requires', () => {
      const fifty = Array.from({ length: 50 }, (_, i) => `Option ${i}`).join('\n');
      expect(customFieldSchema.safeParse(dropdown(fifty)).success).toBe(true);

      const fiftyOne = Array.from({ length: 51 }, (_, i) => `Option ${i}`).join('\n');
      expect(issueFor(dropdown(fiftyOne), 'optionsText')).toBe(
        'bookingFields.validation.optionsTooMany',
      );
    });

    it('refuses duplicates, which the DB allows but nobody wants', () => {
      // Two identical options cannot be told apart, and create_booking validates
      // an answer by membership so either would pass.
      expect(issueFor(dropdown('Short\nShort'), 'optionsText')).toBe(
        'bookingFields.validation.optionsDuplicate',
      );
    });

    it('counts options after trimming and dropping blanks', () => {
      expect(customFieldSchema.safeParse(dropdown('  One  \n\n  Two  \n')).success).toBe(true);
    });
  });

  it('ignores options on a non-dropdown type', () => {
    // The DB refuses options on another type, so the form simply does not send
    // them; the text is not validated for a type that will not use it.
    expect(
      customFieldSchema.safeParse(valid({ fieldType: 'number', optionsText: 'a' })).success,
    ).toBe(true);
  });

  it('requires at least one service when scoped to selected services', () => {
    expect(issueFor(valid({ appliesToAllServices: false, serviceIds: [] }), 'serviceIds')).toBe(
      'bookingFields.validation.servicesRequired',
    );

    expect(
      customFieldSchema.safeParse(
        valid({
          appliesToAllServices: false,
          serviceIds: ['3f2504e0-4f89-11d3-9a0c-0305e82c3301'],
        }),
      ).success,
    ).toBe(true);
  });

  it('does not require services when it applies to all of them', () => {
    expect(
      customFieldSchema.safeParse(valid({ appliesToAllServices: true, serviceIds: [] })).success,
    ).toBe(true);
  });
});

describe('canClearSensitive', () => {
  it('allows clearing only when it was never on', () => {
    // enforce_custom_field_guard refuses the reverse: the answers already
    // captured were given under that promise.
    expect(canClearSensitive(false)).toBe(true);
    expect(canClearSensitive(true)).toBe(false);
  });
});
