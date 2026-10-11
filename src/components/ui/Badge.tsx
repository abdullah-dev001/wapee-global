import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { theme } from '@/lib/theme';
import { type ColorToken } from '@/lib/theme/colors';

import { Text } from './Text';

/** Status dot diameter (DESIGN_GUIDE §12.16). */
const DOT_SIZE = 6;

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary';

type TonePalette = {
  text: ColorToken;
  dot: ColorToken;
  background: ColorToken;
  border: ColorToken;
};

/** DESIGN_GUIDE §12.16 tone table (label text uses the AA-contrast `*Text` tokens, the dot keeps the base colour). */
const tones: Record<BadgeTone, TonePalette> = {
  neutral: {
    text: 'textSecondary',
    dot: 'textSecondary',
    background: 'surfaceHover',
    border: 'border',
  },
  success: {
    text: 'successText',
    dot: 'success',
    background: 'successLight',
    border: 'successBorder',
  },
  warning: {
    text: 'warningText',
    dot: 'warning',
    background: 'warningLight',
    border: 'warningBorder',
  },
  error: { text: 'errorText', dot: 'error', background: 'errorLight', border: 'errorBorder' },
  info: { text: 'infoText', dot: 'info', background: 'infoLight', border: 'infoBorder' },
  primary: { text: 'primary', dot: 'primary', background: 'primaryLight', border: 'primaryLight' },
};

export type BadgeProps = {
  children: string;
  tone?: BadgeTone;
  /** Shows a 6px dot in the tone colour before the label (status pills). */
  dot?: boolean;
  /** Icon node rendered before the label (11px, stroke 2). */
  icon?: ReactNode;
  style?: ViewStyle;
};

/** Pill label: 11px / 600, tinted background, 1px border. */
export function Badge({ children, tone = 'neutral', dot = false, icon, style }: BadgeProps) {
  const palette = tones[tone];
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.colors[palette.background],
          borderColor: theme.colors[palette.border],
        },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: theme.colors[palette.dot] }]} /> : null}
      {icon}
      <Text variant="badge" color={palette.text} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing[5],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[8],
    borderRadius: theme.radius.full,
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
    maxWidth: '100%',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: theme.radius.full,
  },
});
