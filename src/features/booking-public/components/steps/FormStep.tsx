import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useForm, useController, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import { FormField, PhoneInput } from '@/components/shared';
import { Button, Select, Text, Toggle } from '@/components/ui';
import { theme } from '@/lib/theme';

import { EMAIL_FIELD_ID } from '../../errorHandling';
import { buildBookingFormSchema } from '../../schemas/bookingForm.schema';
import { HoneypotField } from '../HoneypotField';
import type { PublicFormFieldSnapshot } from '../../types';

export type FormStepValues = Record<string, string | undefined>;

export type FormStepProps = {
  fields: readonly PublicFormFieldSnapshot[];
  requireClientEmail: boolean;
  /** ISO country preselected in the phone picker (the branch's). */
  defaultCountry?: string;
  submitting: boolean;
  /** Highlighted by the server after a failed submit (missing/invalid answer). */
  serverFieldError?: { fieldId: string | null; message: 'missing' | 'invalid' } | null;
  /** Fires once any field is touched, so the parent can confirm before a back-navigation discards it. */
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (values: {
    name: string;
    phone: string;
    email: string;
    notes: string;
    answers: { customFieldId: string; value: string }[];
    honeypotValue: string;
  }) => void;
};

/**
 * Step 4: the booking form — default fields (doc §6.1) in order, then the
 * owner's custom fields that apply to the chosen service, then the hidden
 * honeypot. Built with react-hook-form + zod, same stack as every other form
 * in the app (CLAUDE.md §9).
 */
export function FormStep({
  fields,
  requireClientEmail,
  defaultCountry,
  submitting,
  serverFieldError,
  onDirtyChange,
  onSubmit,
}: FormStepProps) {
  const { t } = useTranslation();
  const [honeypotValue, setHoneypotValue] = useState('');

  const schema = useMemo(
    () => buildBookingFormSchema(fields, requireClientEmail),
    [fields, requireClientEmail],
  );

  const { control, handleSubmit, setError, formState } = useForm<FormStepValues>({
    // The schema shape depends on which custom fields apply to the chosen
    // service, so it is built at runtime (above) rather than being a static
    // type. react-hook-form's generic can't express that, hence the cast.
    resolver: zodResolver(schema) as never,
    defaultValues: { name: '', phone: '', email: '', notes: '' },
  });

  useEffect(() => {
    onDirtyChange?.(formState.isDirty);
    // react-hook-form's formState is a Proxy that only reports a field as
    // read/changed once something has actually touched it, so `isDirty` alone
    // is a safe "has anything been typed" signal here.
  }, [formState.isDirty, onDirtyChange]);

  const submit = useCallback(
    (values: FormStepValues) => {
      const answers = fields.map((f) => ({
        customFieldId: f.id,
        value: values[`custom_${f.id}`] ?? '',
      }));
      onSubmit({
        name: values.name ?? '',
        phone: values.phone ?? '',
        email: values.email ?? '',
        notes: values.notes ?? '',
        answers,
        honeypotValue,
      });
    },
    [fields, honeypotValue, onSubmit],
  );

  // Surface a server-side rejection (missing/invalid answer) on the right field
  // after a round trip, same codes the Edge Function returns. In an effect,
  // never during render, since this reaches into react-hook-form's state.
  useEffect(() => {
    if (!serverFieldError?.fieldId) return;
    if (serverFieldError.fieldId === EMAIL_FIELD_ID) {
      setError('email', { type: 'server', message: 'bookingPublic.form.errors.emailRequired' });
      return;
    }
    setError(`custom_${serverFieldError.fieldId}` as never, {
      type: 'server',
      message:
        serverFieldError.message === 'missing'
          ? 'bookingPublic.form.errors.required'
          : 'bookingPublic.form.errors.invalid',
    });
  }, [serverFieldError, setError]);

  return (
    <View style={styles.wrapper}>
      <FormField
        control={control}
        name="name"
        label={t('bookingPublic.form.name')}
        required
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
      />

      <PhoneController control={control} defaultCountry={defaultCountry} />

      <FormField
        control={control}
        name="email"
        label={t('bookingPublic.form.email')}
        required={requireClientEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        returnKeyType="next"
      />

      <FormField
        control={control}
        name="notes"
        label={t('bookingPublic.form.notes')}
        multiline
        returnKeyType="default"
      />

      {fields.map((field) => (
        <CustomFieldControl key={field.id} control={control} field={field} />
      ))}

      <HoneypotField value={honeypotValue} onChange={setHoneypotValue} />

      <Button onPress={handleSubmit(submit)} loading={submitting} fullWidth>
        {t('bookingPublic.form.submit')}
      </Button>
    </View>
  );
}

function PhoneController({
  control,
  defaultCountry,
}: {
  control: Control<FormStepValues>;
  defaultCountry?: string;
}) {
  const { t } = useTranslation();
  const { field, fieldState } = useController({ control, name: 'phone' });
  const message = fieldState.error?.message;
  return (
    <PhoneInput
      label={t('bookingPublic.form.phone')}
      hint={t('bookingPublic.form.phoneHint')}
      required
      value={field.value ?? ''}
      onChange={field.onChange}
      defaultCountry={defaultCountry}
      error={message ? String(t(message as never)) : undefined}
    />
  );
}

function CustomFieldControl({
  control,
  field,
}: {
  control: Control<FormStepValues>;
  field: PublicFormFieldSnapshot;
}) {
  const name = `custom_${field.id}` as const;

  if (field.fieldType === 'dropdown') {
    return (
      <DropdownController
        control={control}
        name={name}
        label={field.label}
        hint={field.helpText ?? undefined}
        required={field.isRequired}
        options={field.options ?? []}
      />
    );
  }

  if (field.fieldType === 'yes_no') {
    return (
      <YesNoController
        control={control}
        name={name}
        label={field.label}
        hint={field.helpText ?? undefined}
      />
    );
  }

  return (
    <FormField
      control={control}
      name={name}
      label={field.label}
      hint={field.helpText ?? undefined}
      required={field.isRequired}
      multiline={field.fieldType === 'long_text'}
      keyboardType={field.fieldType === 'number' ? 'numeric' : 'default'}
    />
  );
}

function DropdownController({
  control,
  name,
  label,
  hint,
  required,
  options,
}: {
  control: Control<FormStepValues>;
  name: string;
  label: string;
  hint?: string;
  required: boolean;
  options: readonly string[];
}) {
  const { t } = useTranslation();
  const { field, fieldState } = useController({ control, name: name as never });
  const message = fieldState.error?.message;
  return (
    <Select
      label={label}
      hint={hint}
      required={required}
      value={(field.value as string) || null}
      onChange={field.onChange}
      options={options.map((o) => ({ value: o, label: o }))}
      error={message ? String(t(message as never)) : undefined}
    />
  );
}

function YesNoController({
  control,
  name,
  label,
  hint,
}: {
  control: Control<FormStepValues>;
  name: string;
  label: string;
  hint?: string;
}) {
  const value = useWatch({ control, name: name as never }) as unknown as string | undefined;
  const { field } = useController({ control, name: name as never });
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="helper" color="textSecondary">
            {hint}
          </Text>
        ) : null}
      </View>
      <Toggle
        value={value === 'true'}
        onValueChange={(v) => field.onChange(v ? 'true' : 'false')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[16],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
  },
  toggleText: {
    flex: 1,
    gap: theme.spacing[2],
  },
});
