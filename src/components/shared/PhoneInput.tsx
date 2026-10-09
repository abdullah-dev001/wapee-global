import { ChevronDown } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { findDialCode, flagEmoji, type DialCode, DEFAULT_DIAL_CODE } from '@/config/dialCodes';
import { fromE164, toE164 } from '@/config/e164';
import { focusRing, theme } from '@/lib/theme';

import { PhoneCountryPicker } from './PhoneCountryPicker';

export type PhoneInputProps = {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Full E.164 value ("" when empty), e.g. "+447700900123". */
  value: string;
  onChange: (e164: string) => void;
  /** ISO 3166-1 alpha-2 to preselect the dial code. Defaults to GB. */
  defaultCountry?: string;
};

/**
 * Country code + national number, reporting real E.164 — never a raw national
 * number the server has to guess at. `normalise_phone_e164()` in the database
 * (CLAUDE.md, booking-engine.md) is a best-effort fallback for an already-E.164
 * value it cannot fully validate; this component is what makes that the common
 * path rather than the primary one.
 *
 * The dial-code list is `src/config/dialCodes.ts` (every country with a code).
 */
export function PhoneInput({
  label,
  hint,
  error,
  required = false,
  value,
  onChange,
  defaultCountry,
}: PhoneInputProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { handlers, showFocusRing } = useInteractionState(false);

  // Split the incoming E.164 back into { dial, national } for display.
  // The picked country is state, NOT derived from the number: with an empty number
  // (or a code shared by several countries, like +1) nothing in `value` can say which
  // country was chosen. Until the user picks one, the business country is used.
  const fallbackCountry = findDialCode(defaultCountry) ?? DEFAULT_DIAL_CODE;
  const [chosen, setChosen] = useState<DialCode | null>(null);
  const base = chosen ?? fallbackCountry;
  const { country, nationalNumber: national } = useMemo(
    () => fromE164(value, base, base),
    [value, base],
  );

  const emit = useCallback(
    (nextCountry: DialCode, nextNational: string) => onChange(toE164(nextCountry, nextNational)),
    [onChange],
  );

  const hasError = Boolean(error);

  return (
    <View style={styles.container}>
      {label ? (
        <Text variant="label">
          {label}
          {required ? (
            <Text variant="label" color="error">
              {' *'}
            </Text>
          ) : null}
        </Text>
      ) : null}

      <View style={styles.row}>
        <Pressable
          {...handlers}
          onPress={() => {
            // Dismiss first: the keyboard can otherwise stay up and cover the
            // bottom of this sheet (it takes up to 70% of the screen height).
            Keyboard.dismiss();
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('phoneInput.countryCode')}
          accessibilityValue={{ text: `${country.name} +${country.dialCode}` }}
          style={[
            styles.trigger,
            { borderColor: hasError ? theme.colors.error : theme.colors.border },
            showFocusRing ? focusRing() : null,
          ]}
        >
          <Text variant="body" accessibilityElementsHidden>
            {flagEmoji(country.code)}
          </Text>
          <Text variant="body" color="textPrimary">
            +{country.dialCode}
          </Text>
          <ChevronDown size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
        </Pressable>

        <View
          style={[
            styles.field,
            { borderColor: hasError ? theme.colors.error : theme.colors.border },
          ]}
        >
          <TextInput
            value={national}
            onChangeText={(text) => {
              // A pasted international number ("+92 300 ...") carries its own country.
              if (text.trim().startsWith('+')) {
                const digits = text.replace(/[^0-9]/g, '');
                const parsed = fromE164(`+${digits}`, country, country);
                setChosen(parsed.country);
                emit(parsed.country, parsed.nationalNumber);
                return;
              }
              emit(country, text);
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="done"
            placeholder={t('phoneInput.placeholder')}
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel={label ?? t('phoneInput.label')}
            aria-invalid={hasError}
            style={[styles.input, theme.text.body, { color: theme.colors.textPrimary }]}
          />
        </View>
      </View>

      {hasError ? (
        <Text variant="helper" color="error" role="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="helper" color="textSecondary">
          {hint}
        </Text>
      ) : null}

      <PhoneCountryPicker
        open={open}
        selected={country}
        onSelect={(next) => {
          setChosen(next);
          emit(next, national);
        }}
        onClose={close}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[6],
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing[8],
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
    minHeight: theme.controlHeight.input,
    paddingHorizontal: theme.spacing[10],
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
    borderRadius: theme.radius.md,
  },
  field: {
    flex: 1,
    justifyContent: 'center',
    minHeight: theme.controlHeight.input,
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[10],
    outlineWidth: 0,
  },
});
