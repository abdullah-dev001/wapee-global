import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { focusRing, theme } from '@/lib/theme';

import { Text } from './Text';
import { useInteractionState } from './useInteractionState';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Label above the control, matching Input's 13px/600 label. */
  label?: string;
  /** One line under the control explaining what the setting does. */
  hint?: string;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Segmented control (DESIGN_GUIDE §12). A one-tap choice between 2–4 mutually
 * exclusive options.
 *
 * Preferred over `Select` for small closed sets: a Select opens a sheet, which is
 * three interactions (open, pick, close) for something that should be one, and it
 * hides the alternatives until tapped. A settings screen is exactly where seeing
 * all the options at once matters.
 *
 * **Scrolls horizontally rather than wrapping.** With long translated labels
 * three segments can exceed a 320px screen; wrapping would break the single-row
 * shape that makes a segmented control readable, so it scrolls and the selected
 * segment is always reachable.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  hint,
  disabled = false,
  style,
  testID,
}: SegmentedControlProps<T>) {
  // Each segment needs its own interaction state, and hooks cannot be called in a
  // loop, so the segments are their own component below.
  const content = useMemo(
    () =>
      options.map((option) => (
        <Segment
          key={option.value}
          option={option}
          selected={option.value === value}
          disabled={disabled}
          onPress={() => onChange(option.value)}
        />
      )),
    [options, value, disabled, onChange],
  );

  return (
    <View style={style} testID={testID}>
      {label ? (
        <Text variant="label" color="textPrimary" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // The track is the scroll container, so the grey background and border
        // stay put while the segments move inside it.
        style={[styles.track, disabled && styles.trackDisabled]}
        contentContainerStyle={styles.trackContent}
        // Keyboard dismissal is the caller's business; a settings row should not
        // close the keyboard just because the user scrolled a control.
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </ScrollView>

      {hint ? (
        <Text variant="helper" color="textSecondary" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function Segment<T extends string>({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: SegmentedOption<T>;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { handlers, showHover, showFocusRing } = useInteractionState(disabled);

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={option.label}
      style={[
        styles.segment,
        selected && styles.segmentSelected,
        // Hover is web-only (useInteractionState never reports it on native).
        !selected && showHover && styles.segmentHovered,
        showFocusRing && focusRing(),
      ]}
    >
      <Text
        variant="buttonSm"
        color={selected ? 'textOnPrimary' : 'textSecondary'}
        numberOfLines={1}
        // Tight control: a large system font must not break the single-row shape.
        maxFontSizeMultiplier={1.3}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: theme.spacing[6],
  },
  track: {
    backgroundColor: theme.colors.surfaceHover,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexGrow: 0,
  },
  trackDisabled: {
    opacity: theme.opacity.disabled,
  },
  trackContent: {
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  segment: {
    // 44px total height with the track padding, so the touch target meets the
    // CLAUDE.md §4 minimum on mobile.
    minHeight: theme.layout.minTouchTarget - theme.spacing[6],
    paddingHorizontal: theme.spacing[14],
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
  },
  segmentSelected: {
    backgroundColor: theme.colors.primary,
  },
  segmentHovered: {
    backgroundColor: theme.colors.surface,
  },
  hint: {
    marginTop: theme.spacing[6],
  },
});
