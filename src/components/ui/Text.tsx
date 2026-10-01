import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { theme, type TextVariant } from '@/lib/theme';
import { type ColorToken } from '@/lib/theme/colors';

export type TextProps = RNTextProps & {
  /** Type scale variant (DESIGN_GUIDE §3). Default `body`. */
  variant?: TextVariant;
  /** Colour token. Default `textPrimary`. */
  color?: ColorToken;
  align?: TextStyle['textAlign'];
};

/**
 * The only text component. Always pick a `variant` so font, size, line-height and
 * letter-spacing stay on the scale. Never set `fontWeight` (weight = font family).
 */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  align,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      {...rest}
      style={[
        theme.text[variant],
        { color: theme.colors[color] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
