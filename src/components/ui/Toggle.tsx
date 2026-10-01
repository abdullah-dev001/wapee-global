import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { focusRing, shadow, theme } from '@/lib/theme';

import { Text } from './Text';
import { useInteractionState } from './useInteractionState';

const TRACK_WIDTH = 36;
const TRACK_HEIGHT = 20;
const THUMB_SIZE = 14;
const THUMB_INSET = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Text next to the switch. Tapping it toggles too. */
  label?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

/** Switch: 36×20 track, 14px thumb, animated over 180ms. */
export function Toggle({
  value,
  onValueChange,
  label,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: ToggleProps) {
  const { handlers, showFocusRing } = useInteractionState(disabled);
  const progress = useDerivedValue(() =>
    withTiming(value ? 1 : 0, { duration: theme.duration.base }),
  );

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.border, theme.colors.primary],
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  return (
    <Pressable
      {...handlers}
      onPress={disabled ? undefined : () => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[styles.row, { opacity: disabled ? theme.opacity.disabled : 1 }, style]}
    >
      <Animated.View style={[styles.track, trackStyle, showFocusRing ? focusRing() : null]}>
        <Animated.View style={[styles.thumb, shadow('sm'), thumbStyle]} />
      </Animated.View>
      {label ? <Text variant="body">{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing[10],
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: theme.radius.full,
    padding: THUMB_INSET,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
  },
});
