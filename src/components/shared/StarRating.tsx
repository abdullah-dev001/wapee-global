import { Star } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

import { starFlags } from './starFlags';

export type StarRatingProps = {
  /** 0..5; anything else shows no stars. */
  rating: number;
  /** Icon size in px. Default `theme.iconSize.md`. */
  size?: number;
  /** Colour of the filled stars. Default `theme.colors.warning`. A website passes its accent. */
  color?: string;
  /** Spoken label, e.g. "4 out of 5 stars". */
  accessibilityLabel?: string;
};

/** Read-only star row. Filled = rating, empty = muted outline. */
export function StarRating({
  rating,
  size = theme.iconSize.md,
  color = theme.colors.warning,
  accessibilityLabel,
}: StarRatingProps) {
  return (
    <View
      style={styles.row}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {starFlags(rating).map((filled, index) => (
        <Star
          key={index}
          size={size}
          strokeWidth={theme.iconStroke}
          color={filled ? color : theme.colors.textMuted}
          fill={filled ? color : 'none'}
        />
      ))}
    </View>
  );
}

export type StarRatingInputProps = {
  value: number;
  onChange: (value: number) => void;
  /** Spoken label for one star button, given its number, e.g. "3 stars". */
  labelFor: (value: number) => string;
  color?: string;
  disabled?: boolean;
};

/** Five tappable stars (>= 44px targets), exposed as a radio group. */
export function StarRatingInput({
  value,
  onChange,
  labelFor,
  color = theme.colors.warning,
  disabled = false,
}: StarRatingInputProps) {
  return (
    <View style={styles.inputRow} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ checked: n === value, disabled }}
            accessibilityLabel={labelFor(n)}
            disabled={disabled}
            onPress={() => onChange(n)}
            hitSlop={4}
            style={styles.starButton}
          >
            <Star
              size={theme.iconSize.xl + 10}
              strokeWidth={theme.iconStroke}
              color={filled ? color : theme.colors.textMuted}
              fill={filled ? color : 'none'}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing[2] },
  inputRow: { flexDirection: 'row', gap: theme.spacing[4], justifyContent: 'center' },
  starButton: {
    minWidth: theme.layout.minTouchTarget,
    minHeight: theme.layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
