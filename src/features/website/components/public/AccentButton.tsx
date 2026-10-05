import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { type LucideIcon } from 'lucide-react-native';

import { theme } from '@/lib/theme';

import { WText } from './WText';
import { useWebsiteTheme } from './WebsiteThemeContext';

export type AccentButtonProps = {
  children: string;
  /** `accent` = filled with the brand colour; `surface` = white (for use on the hero); `outline`. */
  tone?: 'accent' | 'surface' | 'outline';
  startIcon?: LucideIcon;
  onPress?: () => void;
  /** Opens this URL (tel:, https:, wa.me). Ignored when `onPress` is set. */
  href?: string;
  accessibilityLabel?: string;
  fullWidth?: boolean;
};

/**
 * The one themed button of the public website. It exists because the shared
 * `Button` is fixed to the app palette; this one takes the owner's accent and
 * corner radius. Always >= 44px high.
 */
export function AccentButton({
  children,
  tone = 'accent',
  startIcon: Icon,
  onPress,
  href,
  accessibilityLabel,
  fullWidth = false,
}: AccentButtonProps) {
  const { theme: site } = useWebsiteTheme();

  const background =
    tone === 'accent' ? site.accent : tone === 'surface' ? theme.colors.surface : 'transparent';
  const foreground =
    tone === 'accent'
      ? site.onAccent
      : tone === 'surface'
        ? theme.colors.textPrimary
        : site.accentText;
  const border = tone === 'outline' ? site.accentText : background;

  const handlePress = () => {
    if (onPress) onPress();
    else if (href) void Linking.openURL(href);
  };

  return (
    <Pressable
      accessibilityRole={href && !onPress ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel ?? children}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        fullWidth ? styles.full : null,
        {
          backgroundColor: pressed && tone === 'accent' ? site.accentHover : background,
          borderColor: border,
          borderRadius: site.controlRadius,
        },
      ]}
    >
      <View style={styles.row}>
        {Icon ? (
          <Icon size={theme.iconSize.md} strokeWidth={theme.iconStroke} color={foreground} />
        ) : null}
        <WText variant="buttonMd" style={{ color: foreground }}>
          {children}
        </WText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.layout.minTouchTarget,
    paddingHorizontal: theme.spacing[20],
    paddingVertical: theme.spacing[10],
    borderWidth: theme.borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8] },
});
