import { Check, ChevronDown } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { focusRing, shadow, theme } from '@/lib/theme';

import { Text } from './Text';
import { useInteractionState } from './useInteractionState';
import { useOverlayDismiss } from './useOverlayDismiss';

export type SelectOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  /** Second line, e.g. a currency code under a country name. */
  hint?: string;
};

export type SelectProps<TValue extends string = string> = {
  options: readonly SelectOption<TValue>[];
  value: TValue | null;
  onChange: (value: TValue) => void;
  label?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Sheet heading; defaults to `label`. */
  title?: string;
  testID?: string;
};

/**
 * Picker that behaves the same on all three platforms: a trigger shaped like
 * `Input`, opening a sheet with a scrollable list.
 *
 * A native `<select>` was not used because it cannot be styled consistently and
 * does not exist on native at all. The list is a `FlatList` so a long list
 * (400+ timezones) stays smooth.
 */
export function Select<TValue extends string = string>({
  options,
  value,
  onChange,
  label,
  placeholder,
  hint,
  error,
  required = false,
  disabled = false,
  title,
  testID,
}: SelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { handlers, showFocusRing } = useInteractionState(disabled);
  useOverlayDismiss(open, () => setOpen(false));

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
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

      <Pressable
        {...handlers}
        onPress={disabled ? undefined : () => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label }}
        accessibilityState={{ disabled, expanded: open }}
        testID={testID}
        style={[
          styles.trigger,
          {
            borderColor: hasError ? theme.colors.error : theme.colors.border,
            backgroundColor: disabled ? theme.colors.surfaceHover : theme.colors.surface,
          },
          showFocusRing ? focusRing() : null,
        ]}
      >
        <Text
          variant="body"
          color={selected ? 'textPrimary' : 'textMuted'}
          numberOfLines={1}
          style={styles.triggerLabel}
        >
          {selected?.label ?? placeholder ?? ''}
        </Text>
        <ChevronDown size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
      </Pressable>

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
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, shadow('lg'), { paddingBottom: insets.bottom }]}>
            <View style={styles.sheetHeader}>
              <Text variant="dialogTitle">{title ?? label ?? ''}</Text>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Option
                  option={item}
                  selected={item.value === value}
                  onPress={() => {
                    onChange(item.value);
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

function Option<TValue extends string>({
  option,
  selected,
  onPress,
}: {
  option: SelectOption<TValue>;
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
      <View style={styles.optionText}>
        <Text variant={selected ? 'bodyStrong' : 'body'} numberOfLines={1}>
          {option.label}
        </Text>
        {option.hint ? (
          <Text variant="helper" color="textSecondary" numberOfLines={1}>
            {option.hint}
          </Text>
        ) : null}
      </View>
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
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    minHeight: theme.controlHeight.input,
    paddingHorizontal: theme.spacing[12],
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
    borderRadius: theme.radius.md,
  },
  triggerLabel: {
    flex: 1,
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
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: '70%',
  },
  sheetHeader: {
    paddingVertical: theme.spacing[16],
    paddingHorizontal: theme.spacing[20],
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[14],
    paddingHorizontal: theme.spacing[20],
    minHeight: theme.layout.minTouchTarget,
  },
  optionText: {
    flex: 1,
    gap: theme.spacing[2],
  },
});
