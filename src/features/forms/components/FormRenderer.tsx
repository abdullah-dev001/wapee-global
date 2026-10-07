import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Input, SegmentedControl, Select, Text } from '@/components/ui';
import { theme } from '@/lib/theme';

import { type AnswerValue, type Answers, type FormBlock, type FormField } from '../formsLogic';

/**
 * Shows a form version: the consent text (plain blocks, never HTML) and the questions. Used by the
 * dashboard signing drawer and the public signing page, so both look and validate the same way.
 */
export function FormRenderer({
  body,
  fields,
  answers,
  onChange,
  invalidFieldId,
  disabled = false,
}: {
  body: readonly FormBlock[];
  fields: readonly FormField[];
  answers: Answers;
  onChange: (fieldId: string, value: AnswerValue) => void;
  /** The field to mark (a server or client validation result). */
  invalidFieldId?: string | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.stack}>
      {body.map((block, i) =>
        block.type === 'heading' ? (
          <Text key={i} variant="sectionTitle">
            {block.text}
          </Text>
        ) : block.type === 'bullet' ? (
          <View key={i} style={styles.bullet}>
            <Text variant="paragraph">•</Text>
            <Text variant="paragraph" style={styles.grow}>
              {block.text}
            </Text>
          </View>
        ) : (
          <Text key={i} variant="paragraph">
            {block.text}
          </Text>
        ),
      )}

      {fields.map((field) => {
        const value = answers[field.id];
        const error = invalidFieldId === field.id ? t('forms.fill.fieldProblem') : undefined;
        const label = field.label;
        const hint = field.help ?? undefined;
        if (field.type === 'yes_no') {
          return (
            <SegmentedControl<'yes' | 'no' | ''>
              key={field.id}
              label={field.required ? `${label} *` : label}
              hint={error ?? hint}
              disabled={disabled}
              options={[
                { value: 'yes', label: t('forms.fill.yes') },
                { value: 'no', label: t('forms.fill.no') },
              ]}
              value={value === true ? 'yes' : value === false ? 'no' : ''}
              onChange={(v) => onChange(field.id, v === 'yes')}
            />
          );
        }
        if (field.type === 'dropdown') {
          return (
            <Select
              key={field.id}
              label={label}
              hint={hint}
              error={error}
              required={field.required}
              disabled={disabled}
              options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
              value={typeof value === 'string' && value ? value : null}
              onChange={(v) => onChange(field.id, v)}
            />
          );
        }
        if (field.type === 'number') {
          return (
            <Input
              key={field.id}
              label={label}
              hint={hint}
              error={error}
              required={field.required}
              editable={!disabled}
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={typeof value === 'number' ? String(value) : ''}
              onChangeText={(text) => {
                const cleaned = text.replace(',', '.').trim();
                onChange(
                  field.id,
                  cleaned === '' ? null : Number.isFinite(Number(cleaned)) ? Number(cleaned) : null,
                );
              }}
            />
          );
        }
        return (
          <Input
            key={field.id}
            label={label}
            hint={hint}
            error={error}
            required={field.required}
            editable={!disabled}
            multiline={field.type === 'long_text'}
            value={typeof value === 'string' ? value : ''}
            onChangeText={(text) => onChange(field.id, text)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[16] },
  bullet: { flexDirection: 'row', gap: theme.spacing[8] },
  grow: { flex: 1 },
});
