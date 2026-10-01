import { type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { focusRing, theme } from '@/lib/theme';
import { type ColorToken } from '@/lib/theme/colors';

import { Spinner } from './Spinner';
import { Text } from './Text';
import { useInteractionState } from './useInteractionState';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type VariantStyle = {
  background: ColorToken;
  backgroundHover: ColorToken;
  border: ColorToken;
  borderHover: ColorToken;
  text: ColorToken;
};

/** DESIGN_GUIDE §12.1 variant table. */
const variantStyles: Record<ButtonVariant, VariantStyle> = {
  primary: {
    background: 'primary',
    backgroundHover: 'primaryHover',
    border: 'primary',
    borderHover: 'primaryHover',
    text: 'textOnPrimary',
  },
  secondary: {
    background: 'secondary',
    backgroundHover: 'secondaryHover',
    border: 'secondary',
    borderHover: 'secondaryHover',
    text: 'textOnSecondary',
  },
  ghost: {
    background: 'transparent',
    backgroundHover: 'surfaceHover',
    border: 'border',
    borderHover: 'textMuted',
    text: 'textPrimary',
  },
  danger: {
    background: 'error',
    backgroundHover: 'errorHover',
    border: 'error',
    borderHover: 'errorHover',
    text: 'textOnPrimary',
  },
};

const sizeStyles = {
  sm: {
    height: theme.controlHeight.sm,
    paddingHorizontal: theme.spacing[14],
    variant: 'buttonSm',
    icon: 14,
  },
  md: {
    height: theme.controlHeight.md,
    paddingHorizontal: theme.spacing[18],
    variant: 'buttonMd',
    icon: 16,
  },
  lg: {
    height: theme.controlHeight.lg,
    paddingHorizontal: theme.spacing[24],
    variant: 'buttonLg',
    icon: 18,
  },
} as const;

export type ButtonProps = {
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Lucide icon shown before the label. Replaced by the spinner while loading. */
  startIcon?: LucideIcon;
  /** Accessible name when the label alone is not clear enough. */
  accessibilityLabel?: string;
  testID?: string;
  style?: ViewStyle;
};

/**
 * The only button. Variants primary / secondary (lime) / ghost / danger,
 * sizes sm 34 / md 41 / lg 48. Hover is web-only; the focus ring is web-only;
 * disabled and loading both render at 0.55 opacity and block presses.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  fullWidth = false,
  startIcon: StartIcon,
  accessibilityLabel,
  testID,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const { handlers, showHover, showFocusRing } = useInteractionState(inactive);
  const palette = variantStyles[variant];
  const sizing = sizeStyles[size];

  const backgroundToken = showHover ? palette.backgroundHover : palette.background;
  const borderToken = showHover ? palette.borderHover : palette.border;

  return (
    <Pressable
      {...handlers}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        {
          height: sizing.height,
          paddingHorizontal: sizing.paddingHorizontal,
          backgroundColor: theme.colors[backgroundToken],
          borderColor: theme.colors[borderToken],
          opacity: inactive ? theme.opacity.disabled : 1,
        },
        fullWidth ? styles.fullWidth : null,
        showFocusRing ? focusRing() : null,
        style,
      ]}
    >
      {loading ? (
        <Spinner size={sizing.icon} color={palette.text} />
      ) : StartIcon ? (
        <View style={styles.icon}>
          <StartIcon
            size={sizing.icon}
            strokeWidth={theme.iconStroke}
            color={theme.colors[palette.text]}
          />
        </View>
      ) : null}
      <Text variant={sizing.variant} color={palette.text} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing[8],
    borderRadius: theme.radius.md,
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
