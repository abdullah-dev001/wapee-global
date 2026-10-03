import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import { focusRing, theme } from '@/lib/theme';

import { Text } from './Text';
import { useInteractionState } from './useInteractionState';

export type NumberStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** How much a tap on +/- moves the value. */
  step?: number;
  label?: string;
  /** One line under the control explaining the setting. */
  hint?: string;
  /** Shown after the number, e.g. "minutes", "days". Not editable. */
  suffix?: string;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/** Clamp and round to an integer. Exported so the settings screen can reuse it. */
export function clampInteger(raw: number, min: number, max: number): number {
  if (!Number.isFinite(raw)) return min;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/**
 * A bounded integer input: − [ 30 ] + with a unit.
 *
 * Used for buffer, minimum notice, booking window, cancel cutoff and people per
 * slot. Every one of those has DB CHECK constraints, and a free-text number input
 * invites values the database then rejects — so the control refuses to produce an
 * out-of-range number in the first place.
 *
 * **Typing is allowed and clamped on blur, not on every keystroke.** Clamping
 * mid-typing makes "120" impossible to enter when the minimum is 15: the "1"
 * becomes 15 and the rest appends to that. So the raw text is held locally while
 * focused and only reconciled when the field is left.
 */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  hint,
  suffix,
  disabled = false,
  style,
  testID,
}: NumberStepperProps) {
  // While the field is focused the user's raw text wins, because it may
  // transiently be empty or out of range ("1" on the way to "120"). The rest of
  // the time the prop wins, so an external reset or a server reload shows through.
  //
  // Stored as a draft rather than synced in an effect: `setState` inside an effect
  // is an extra render and the lint rule (react-hooks/set-state-in-effect)
  // correctly rejects it. `null` means "not editing — show the prop".
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);

  const commit = useCallback(
    (raw: string) => {
      const parsed = Number(raw.replace(/[^0-9-]/g, ''));
      const next = clampInteger(parsed, min, max);
      // Stop editing, so the prop becomes the source of truth again.
      setDraft(null);
      if (next !== value) onChange(next);
    },
    [min, max, value, onChange],
  );

  const nudge = useCallback(
    (delta: number) => {
      const next = clampInteger(value + delta, min, max);
      setDraft(null);
      if (next !== value) onChange(next);
    },
    [value, min, max, onChange],
  );

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={style} testID={testID}>
      {label ? (
        <Text variant="label" color="textPrimary" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View style={[styles.row, disabled && styles.rowDisabled]}>
        <StepButton
          kind="minus"
          onPress={() => nudge(-step)}
          disabled={disabled || atMin}
          accessibilityLabel={`${label ?? ''} −${step}`}
        />

        <View style={styles.field}>
          <TextInput
            value={text}
            onChangeText={setDraft}
            onBlur={() => commit(text)}
            // A plain number pad: no decimals (every one of these settings is
            // whole minutes, days, hours or people) and no sign.
            keyboardType="number-pad"
            inputMode="numeric"
            returnKeyType="done"
            onSubmitEditing={() => commit(text)}
            editable={!disabled}
            selectTextOnFocus
            accessibilityLabel={label}
            style={styles.input}
            // A big system font must not push the suffix out of the row.
            maxFontSizeMultiplier={1.4}
          />
          {suffix ? (
            <Text
              variant="small"
              color="textSecondary"
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
            >
              {suffix}
            </Text>
          ) : null}
        </View>

        <StepButton
          kind="plus"
          onPress={() => nudge(step)}
          disabled={disabled || atMax}
          accessibilityLabel={`${label ?? ''} +${step}`}
        />
      </View>

      {hint ? (
        <Text variant="helper" color="textSecondary" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function StepButton({
  kind,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  kind: 'minus' | 'plus';
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(disabled);
  const Icon = kind === 'minus' ? Minus : Plus;

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[
        styles.stepButton,
        showHover && styles.stepButtonHovered,
        disabled && styles.stepButtonDisabled,
        showFocusRing && focusRing(),
      ]}
    >
      <Icon
        size={theme.iconSize.md}
        strokeWidth={theme.iconStroke}
        color={disabled ? theme.colors.textMuted : theme.colors.textPrimary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: theme.spacing[6],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    // Matches Input's ~40px height so a column of mixed controls lines up.
    minHeight: theme.controlHeight.input,
  },
  rowDisabled: {
    opacity: theme.opacity.disabled,
    backgroundColor: theme.colors.surfaceHover,
  },
  stepButton: {
    // 44px wide: the whole button is the touch target (CLAUDE.md §4).
    width: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceHover,
  },
  stepButtonHovered: {
    backgroundColor: theme.colors.border,
  },
  stepButtonDisabled: {
    backgroundColor: theme.colors.borderSubtle,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[6],
    paddingHorizontal: theme.spacing[8],
  },
  input: {
    // Not `flex: 1`: the number should sit next to its unit, centred together,
    // rather than the unit being pushed to the edge.
    minWidth: 32,
    textAlign: 'center',
    color: theme.colors.textPrimary,
    fontFamily: theme.font.family.medium,
    fontSize: theme.font.size.base,
    // Android adds its own vertical padding to TextInput; zero it so the row
    // keeps the height the border defines.
    paddingVertical: 0,
  },
  hint: {
    marginTop: theme.spacing[6],
  },
});
