import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Input, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import type { PublicFormField } from '../types';

export type BookingFormPreviewProps = {
  /** The custom fields that apply to the chosen service, in display order. */
  fields: PublicFormField[];
  /** doc §6.1: email is the one default field whose required state can change. */
  requireClientEmail: boolean;
  /**
   * Preview only renders the SHAPE of the form. Step 5 builds the real one with
   * react-hook-form + zod (CLAUDE.md §9), which is why this component takes no
   * values and no onChange — a preview that half-works is worse than one that
   * clearly does not.
   */
  readOnly?: true;
};

/**
 * What the customer's form will look like.
 *
 * The fixed fields come first and in the doc §6.1 order (name, phone, email,
 * notes), then the custom fields. Service and date/time are not rendered: they are
 * chosen in the steps before this one, not typed.
 */
export function BookingFormPreview({ fields, requireClientEmail }: BookingFormPreviewProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      {/* --- The fixed fields (doc §6.1) ------------------------------------ */}
      <PreviewField label={t('bookingPublic.form.name')} required />
      <PreviewField
        label={t('bookingPublic.form.phone')}
        required
        hint={t('bookingPublic.form.phoneHint')}
      />
      <PreviewField label={t('bookingPublic.form.email')} required={requireClientEmail} />
      <PreviewField label={t('bookingPublic.form.notes')} multiline />

      {/* --- The owner's own fields ---------------------------------------- */}
      {fields.length > 0 ? (
        <View style={styles.customGroup}>
          {fields.map((field) => (
            <PreviewField
              key={field.id}
              label={field.label}
              required={field.isRequired}
              hint={field.helpText ?? undefined}
              multiline={field.fieldType === 'long_text'}
              // A dropdown's choices matter to the preview: they are the thing the
              // owner most often gets wrong (one option, or a typo).
              options={field.fieldType === 'dropdown' ? field.options : null}
              yesNo={field.fieldType === 'yes_no'}
              numeric={field.fieldType === 'number'}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PreviewField({
  label,
  required = false,
  hint,
  multiline = false,
  options = null,
  yesNo = false,
  numeric = false,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  multiline?: boolean;
  options?: string[] | null;
  yesNo?: boolean;
  numeric?: boolean;
}) {
  const { t } = useTranslation();

  // A dropdown and a yes/no are not text boxes, so they are drawn as their real
  // shape rather than as an Input that would mislead the owner.
  if (options) {
    return (
      <View>
        <FieldLabel label={label} required={required} hint={hint} />
        <View style={styles.optionList}>
          {options.map((option) => (
            <Badge key={option} tone="neutral">
              {option}
            </Badge>
          ))}
        </View>
      </View>
    );
  }

  if (yesNo) {
    return (
      <View>
        <FieldLabel label={label} required={required} hint={hint} />
        <View style={styles.optionList}>
          <Badge tone="neutral">{t('common.yes')}</Badge>
          <Badge tone="neutral">{t('common.no')}</Badge>
        </View>
      </View>
    );
  }

  return (
    <Input
      label={label}
      required={required}
      hint={hint}
      // Non-interactive on purpose: a preview the owner can type into invites them
      // to think they are editing their own booking.
      editable={false}
      multiline={multiline}
      placeholder={numeric ? t('bookingPublic.form.numberPlaceholder') : undefined}
      value=""
    />
  );
}

function FieldLabel({
  label,
  required,
  hint,
}: {
  label: string;
  required: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.labelRow}>
      <Text variant="label" color="textPrimary">
        {label}
        {required ? ' *' : ''}
      </Text>
      {hint ? (
        <Text variant="helper" color="textSecondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[14],
  },
  customGroup: {
    gap: theme.spacing[14],
    paddingTop: theme.spacing[6],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  labelRow: {
    gap: theme.spacing[2],
    marginBottom: theme.spacing[6],
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[6],
  },
});
