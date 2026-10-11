import { useState } from 'react';

import { Input, type InputProps } from '@/components/ui';

export type IntegerInputProps = Omit<
  InputProps,
  'value' | 'onChange' | 'onChangeText' | 'keyboardType' | 'inputMode'
> & {
  /** A whole number, or null for an empty field. */
  value: number | null;
  /** Called with the whole number, or null when the field is emptied. */
  onChange: (value: number | null) => void;
};

/**
 * Whole-number field (sessions, days, stock counts) for values too large for the
 * `NumberStepper`. Digits only; the parsed number goes up on every keystroke and an empty
 * field is `null`. Range checks live in the zod schema, not here.
 */
export function IntegerInput({ value, onChange, ...inputProps }: IntegerInputProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [lastValue, setLastValue] = useState(value);

  // An EXTERNAL change (loading a record) resyncs the text during render; echoing our own
  // onChange back does not reformat mid-edit.
  if (lastValue !== value) {
    setLastValue(value);
    const typed = text.trim() === '' ? null : Number(text);
    if (typed !== value) setText(value === null ? '' : String(value));
  }

  return (
    <Input
      {...inputProps}
      value={text}
      onChangeText={(next) => {
        const digits = next.replace(/[^0-9]/g, '');
        setText(digits);
        onChange(digits === '' ? null : Number(digits));
      }}
      keyboardType="number-pad"
      inputMode="numeric"
    />
  );
}
