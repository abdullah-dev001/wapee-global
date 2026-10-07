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
const textColor: Partial<Record<ColorToken, ColorToken>> = {
  error: 'errorText',
  success: 'successText',
  warning: 'warningText',
  info: 'infoText',
};

/** Variants that are headings: announced as headings by screen readers unless the caller sets a role. */
const headingVariants: ReadonlySet<TextVariant> = new Set([
  'headline',
  'headlineMobile',
  'pageTitle',
  'pageTitleMobile',
  'authTitle',
  'sectionTitle',
  'dialogTitle',
]);

export function Text({
  variant = 'body',
  color = 'textPrimary',
  align,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      accessibilityRole={headingVariants.has(variant) ? 'header' : undefined}
      {...rest}
      style={[
        theme.text[variant],
        // Status colours are for fills, borders and icons; as TEXT they use the AA-contrast variant.
        { color: theme.colors[textColor[color] ?? color] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
