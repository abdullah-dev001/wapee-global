import { Check, ChevronDown } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { useInteractionState } from '@/components/ui/useInteractionState';
import { useOverlayDismiss } from '@/components/ui/useOverlayDismiss';
import { dialCodes, findDialCode, type DialCode, DEFAULT_DIAL_CODE } from '@/config/dialCodes';
import { fromE164, toE164 } from '@/config/e164';
import { focusRing, shadow, theme } from '@/lib/theme';

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
 * The dial-code list is `src/config/dialCodes.ts`, deliberately the same 42
 * countries `create_booking`'s fallback table uses.
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
  const insets = useSafeAreaInsets();
  const { handlers, showFocusRing } = useInteractionState(false);
  useOverlayDismiss(open, close);

  // Split the incoming E.164 back into { dial, national } for display.
  const fallbackCountry = findDialCode(defaultCountry) ?? DEFAULT_DIAL_CODE;
  const { country, nationalNumber: national } = useMemo(
    () => fromE164(value, fallbackCountry),
    [value, fallbackCountry],
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
          accessibilityValue={{ text: `+${country.dialCode}` }}
          style={[
            styles.trigger,
            { borderColor: hasError ? theme.colors.error : theme.colors.border },
            showFocusRing ? focusRing() : null,
          ]}
        >
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
            onChangeText={(text) => emit(country, text)}
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

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
          <View style={[styles.sheet, shadow('lg'), { paddingBottom: insets.bottom }]}>
            <View style={styles.sheetHeader}>
              <Text variant="dialogTitle">{t('phoneInput.countryCode')}</Text>
            </View>
            <FlatList
              data={dialCodes}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <DialCodeOption
                  option={item}
                  selected={item.code === country.code}
                  onPress={() => {
                    emit(item, national);
                    setOpen(false);
                  }}
                />
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DialCodeOption({
  option,
  selected,
  onPress,
}: {
  option: DialCode;
  selected: boolean;
  onPress: () => void;
}) {
  const { handlers, showHover } = useInteractionState(false);
  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.option, showHover ? { backgroundColor: theme.colors.surfaceHover } : null]}
    >
      <Text variant={selected ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.optionText}>
        {option.name}
      </Text>
      <Text variant="helper" color="textSecondary">
        +{option.dialCode}
      </Text>
      {selected ? (
        <Check size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.primary} />
      ) : null}
    </Pressable>
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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    maxHeight: '70%',
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  sheetHeader: {
    padding: theme.spacing[16],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    minHeight: theme.layout.minTouchTarget,
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[10],
  },
  optionText: {
    flex: 1,
  },
});
