import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '@/lib/theme';
import { type ColorToken } from '@/lib/theme/colors';

export type SpinnerProps = {
  /** Diameter in px. Default 16. */
  size?: number;
  /** Ring colour. `currentColor`-style use: pass the parent's text colour. */
  color?: ColorToken;
  /** Colour of the three-quarter track behind the moving arc. Default transparent. */
  trackColor?: ColorToken;
  style?: ViewStyle;
};

/**
 * The one spinner: a ring with a transparent top edge rotating once every 600ms
 * (DESIGN_GUIDE §9/§12.25). Lists use Skeleton instead; this is for buttons and
 * small inline waits.
 */
export function Spinner({ size = 16, color = 'primary', trackColor, style }: SpinnerProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: theme.duration.spinner, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      style={[styles.container, { width: size, height: size }, style]}
      accessibilityRole="progressbar"
    >
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: size <= 16 ? 2 : Math.round(size / 8),
            borderColor: trackColor ? theme.colors[trackColor] : 'transparent',
            borderTopColor: theme.colors[color],
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderStyle: 'solid',
  },
});
