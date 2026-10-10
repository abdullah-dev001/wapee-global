import type { TextStyle } from 'react-native';

/**
 * Typography tokens. Source: docs/DESIGN_GUIDE.md §3.
 * Sizes are px (the guide's rem values at 16px). On native each DM Sans weight is a
 * separate font family, so weight is chosen via `fontFamily`, never `fontWeight`.
 */

/** Font family names as registered by `useFonts` (see fonts.ts). */
export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
} as const;

export type FontWeightName = keyof typeof fontFamily;

/** Font-size scale in px (DESIGN_GUIDE §3 "Font-size scale"). */
export const fontSize = {
  xxs: 10,
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 15,
  xl: 16,
  '2xl': 17,
  '3xl': 18,
  '4xl': 20,
  '5xl': 22,
  '6xl': 24,
  '7xl': 28,
  '8xl': 32,
} as const;

export type FontSizeToken = keyof typeof fontSize;

/** Line-height multipliers (DESIGN_GUIDE §3 literal values; "normal" ≈ 1.3 for DM Sans). */
export const lineHeight = {
  tight: 1.15,
  snug: 1.2,
  compact: 1.3,
  normal: 1.4,
  relaxed: 1.5,
  loose: 1.6,
} as const;

export type LineHeightToken = keyof typeof lineHeight;

/** Letter-spacing in em: tight for body, tighter for headings and big numbers. */
export const letterSpacingEm = {
  tight: -0.02,
  tighter: -0.03,
} as const;

/** Converts an em letter-spacing to px for a given font size (RN needs px). */
export function letterSpacing(size: number, em: keyof typeof letterSpacingEm = 'tight'): number {
  return Math.round(size * letterSpacingEm[em] * 100) / 100;
}

type TextVariantSpec = {
  size: FontSizeToken;
  weight: FontWeightName;
  lineHeight: LineHeightToken;
  tracking: keyof typeof letterSpacingEm;
};

/** Element → type spec (DESIGN_GUIDE §3 "Element → type spec"). */
const variantSpecs = {
  headline: { size: '8xl', weight: 'bold', lineHeight: 'tight', tracking: 'tighter' },
  headlineMobile: { size: '7xl', weight: 'bold', lineHeight: 'tight', tracking: 'tighter' },
  pageTitle: { size: '6xl', weight: 'semibold', lineHeight: 'compact', tracking: 'tighter' },
  pageTitleMobile: { size: '4xl', weight: 'semibold', lineHeight: 'compact', tracking: 'tighter' },
  authTitle: { size: '5xl', weight: 'semibold', lineHeight: 'compact', tracking: 'tighter' },
  statValue: { size: '6xl', weight: 'bold', lineHeight: 'tight', tracking: 'tighter' },
  statValueMobile: { size: '4xl', weight: 'bold', lineHeight: 'tight', tracking: 'tighter' },
  sectionTitle: { size: 'xl', weight: 'semibold', lineHeight: 'compact', tracking: 'tighter' },
  dialogTitle: { size: 'xl', weight: 'semibold', lineHeight: 'compact', tracking: 'tight' },
  cardTitle: { size: 'lg', weight: 'semibold', lineHeight: 'compact', tracking: 'tight' },
  body: { size: 'base', weight: 'regular', lineHeight: 'normal', tracking: 'tight' },
  bodyStrong: { size: 'base', weight: 'semibold', lineHeight: 'normal', tracking: 'tight' },
  paragraph: { size: 'base', weight: 'regular', lineHeight: 'relaxed', tracking: 'tight' },
  label: { size: 'md', weight: 'semibold', lineHeight: 'compact', tracking: 'tight' },
  small: { size: 'md', weight: 'regular', lineHeight: 'relaxed', tracking: 'tight' },
  helper: { size: 'sm', weight: 'regular', lineHeight: 'compact', tracking: 'tight' },
  caption: { size: 'sm', weight: 'semibold', lineHeight: 'compact', tracking: 'tight' },
  badge: { size: 'xs', weight: 'semibold', lineHeight: 'compact', tracking: 'tight' },
  buttonSm: { size: 'md', weight: 'semibold', lineHeight: 'snug', tracking: 'tight' },
  buttonMd: { size: 'base', weight: 'semibold', lineHeight: 'snug', tracking: 'tight' },
  buttonLg: { size: 'lg', weight: 'semibold', lineHeight: 'snug', tracking: 'tight' },
  nav: { size: 'base', weight: 'medium', lineHeight: 'compact', tracking: 'tight' },
} as const satisfies Record<string, TextVariantSpec>;

export type TextVariant = keyof typeof variantSpecs;

function buildTextStyle(spec: TextVariantSpec): TextStyle {
  const size = fontSize[spec.size];
  return {
    // No fontWeight: each weight is its own family, and fontWeight + custom family
    // can make Android fall back to the system font.
    fontFamily: fontFamily[spec.weight],
    fontSize: size,
    lineHeight: Math.round(size * lineHeight[spec.lineHeight]),
    letterSpacing: letterSpacing(size, spec.tracking),
  };
}

/** Ready-to-use text styles per variant. */
export const textVariants = Object.fromEntries(
  Object.entries(variantSpecs).map(([name, spec]) => [name, buildTextStyle(spec)]),
) as Record<TextVariant, TextStyle>;
