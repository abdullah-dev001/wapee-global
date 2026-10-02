import { useState } from 'react';
import { Platform } from 'react-native';

import { Input, type InputProps } from '@/components/ui';
import { formatMinorAsMajor, parseMajorToMinor, type CurrencyCode } from '@/lib/money';

export type MoneyInputProps = Omit<
  InputProps,
  // `onChange` is omitted too: TextInput's own onChange takes an event, and
  // ours takes minor units, so inheriting both makes the type ambiguous.
  'value' | 'onChange' | 'onChangeText' | 'keyboardType' | 'prefix'
> & {
  /** Minor units, or null for an empty field. */
  value: number | null;
  /** Called with minor units, or null when the field is emptied or invalid. */
  onChange: (amountMinor: number | null) => void;
  /** The BRANCH currency (decision 23) — never a business-level default. */
  currency: CurrencyCode;
  /** Business locale, for the decimal separator and digit shapes. */
  locale: string;
  /** Shown inside the field before the number, e.g. "£". */
  symbol?: string;
};

/**
 * Money field that stores **integer minor units** and never floats
 * (CLAUDE.md §6).
 *
 * The text the person is typing is held locally so a half-finished "12." is not
 * reformatted under their cursor; the parsed value goes up on every keystroke.
 * All parsing lives in `lib/money`, which handles the currency exponent (PKR and
 * JPY have none, KWD has three), locale decimal separators, and non-ASCII digits.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  locale,
  symbol,
  ...inputProps
}: MoneyInputProps) {
  // The raw text is local so a half-typed "12." is not reformatted under the
  // cursor. `lastProps` lets an EXTERNAL change (loading a record, switching
  // branch) resync the text during render — no effect, no flash of stale value.
  const [text, setText] = useState(() =>
    value === null ? '' : formatMinorAsMajor(value, currency),
  );
  const [lastProps, setLastProps] = useState({ value, currency });

  if (lastProps.value !== value || lastProps.currency !== currency) {
    setLastProps({ value, currency });
    const parsed = text.trim() === '' ? null : parseMajorToMinor(text, currency, locale);
    // Only overwrite when the incoming value is genuinely different from what is
    // already typed, so echoing our own onChange back does not reformat mid-edit.
    if (parsed !== value) {
      setText(value === null ? '' : formatMinorAsMajor(value, currency));
    }
  }

  return (
    <Input
      {...inputProps}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(next.trim() === '' ? null : parseMajorToMinor(next, currency, locale));
      }}
      prefix={symbol}
      // `decimal-pad` has no minus sign, which is right for a price.
      keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
      inputMode="decimal"
    />
  );
}
