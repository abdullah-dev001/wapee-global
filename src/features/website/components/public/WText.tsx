import { Platform, type TextStyle } from 'react-native';

import { Text, type TextProps } from '@/components/ui';
import { theme } from '@/lib/theme';

import { fontOverride } from '../../websiteTheme';
import { useWebsiteTheme } from './WebsiteThemeContext';

export type WTextProps = Omit<TextProps, 'color'> & {
  /** A theme colour token, or `accent` for the owner's brand colour (always >= 4.5:1 on white). */
  color?: TextProps['color'] | 'accent';
};

/**
 * Website text: the shared `Text` plus the owner's font choice and, optionally,
 * their accent colour. Everything else (size, line height) stays on the scale.
 */
export function WText({ color = 'textPrimary', variant = 'body', style, ...rest }: WTextProps) {
  const { theme: site } = useWebsiteTheme();
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const override = fontOverride(site.fontKey, String(theme.text[variant].fontFamily), platform);
  const accent: TextStyle | null = color === 'accent' ? { color: site.accentText } : null;

  return (
    <Text
      {...rest}
      variant={variant}
      color={color === 'accent' ? 'textPrimary' : color}
      style={[override as TextStyle | null, accent, style]}
    />
  );
}
