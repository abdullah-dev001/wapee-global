import { useTranslation } from 'react-i18next';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { Input, type InputProps } from '@/components/ui';

export type FormFieldProps<TValues extends FieldValues> = Omit<
  InputProps,
  'value' | 'onChangeText' | 'onBlur' | 'error'
> & {
  control: Control<TValues>;
  name: FieldPath<TValues>;
  /** Side effect on every keystroke, after the form value is updated. */
  onValueChange?: (value: string) => void;
};

/**
 * Connects an `Input` to react-hook-form.
 *
 * Validation messages from the zod schemas are i18n KEYS, not sentences, so
 * they are translated here. That keeps the schemas free of display text and
 * usable on the server side too.
 */
export function FormField<TValues extends FieldValues>({
  control,
  name,
  onValueChange,
  ...inputProps
}: FormFieldProps<TValues>) {
  const { t } = useTranslation();
  const { field, fieldState } = useController({ control, name });

  const message = fieldState.error?.message;
  // A key like "auth.errors.emailInvalid" translates; anything else (a server
  // message) is shown as-is. i18next returns the key unchanged when missing.
  const error =
    message === undefined
      ? undefined
      : message.includes('.')
        ? String(t(message as never))
        : message;

  return (
    <Input
      {...inputProps}
      value={field.value ?? ''}
      onChangeText={(text) => {
        field.onChange(text);
        onValueChange?.(text);
      }}
      onBlur={field.onBlur}
      error={error}
    />
  );
}
