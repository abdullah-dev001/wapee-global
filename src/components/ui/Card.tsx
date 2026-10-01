import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { focusRing, shadow, theme, useBreakpoint } from '@/lib/theme';

import { useInteractionState } from './useInteractionState';

export type CardProps = {
  children: ReactNode;
  /** Adds a primary border + md shadow on hover (web) and makes the card pressable. */
  onPress?: () => void;
  /** Remove the inner padding (for media or list rows that handle their own). */
  noPadding?: boolean;
  /** Draws the featured ring (primary-light border + 3px ring). */
  featured?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Surface container: white, 1px border, radius 12, flat at rest (no shadow).
 * Padding is 24 on tablet/desktop and 18 on mobile.
 */
export function Card({
  children,
  onPress,
  noPadding = false,
  featured = false,
  style,
  testID,
}: CardProps) {
  const { isMobile } = useBreakpoint();
  const { handlers, showHover } = useInteractionState(false);
  const interactive = Boolean(onPress);

  const cardStyle: ViewStyle[] = [
    styles.base,
    {
      padding: noPadding ? 0 : isMobile ? theme.layout.cardPaddingMobile : theme.layout.cardPadding,
      borderColor:
        interactive && showHover
          ? theme.colors.primary
          : featured
            ? theme.colors.primaryLight
            : theme.colors.border,
    },
    ...(interactive && showHover ? [shadow('md')] : []),
    // Featured ring is a web box-shadow; on native the border carries the state.
    ...(featured ? [focusRing()] : []),
    ...(style ? [style] : []),
  ];

  if (!interactive) {
    return (
      <View style={cardStyle} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      {...handlers}
      onPress={onPress}
      accessibilityRole="button"
      style={cardStyle}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
    borderRadius: theme.radius.lg,
  },
});
