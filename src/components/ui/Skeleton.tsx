import { useEffect } from 'react';
import { StyleSheet, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '@/lib/theme';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  /** `sm` for text lines, `lg` for blocks/cards, `full` for avatars. Default `sm`. */
  radius?: 'sm' | 'md' | 'lg' | 'full';
  style?: ViewStyle;
};

/**
 * Pulsing placeholder block (opacity 1 → 0.45 → 1 over 1.4s).
 * Lists and cards use these, never a full-screen spinner.
 */
export function Skeleton({ width = '100%', height = 14, radius = 'sm', style }: SkeletonProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    const half = theme.duration.skeletonPulse / 2;
    opacity.value = withRepeat(
      withSequence(
        withTiming(theme.opacity.skeletonLow, {
          duration: half,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, { duration: half, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        { width, height, borderRadius: theme.radius[radius] },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.surfaceHover,
  },
});
