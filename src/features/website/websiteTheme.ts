/**
 * Website theme resolution. PURE: no React Native imports, so it is unit-tested
 * in plain Node.
 *
 * The owner picks a brand colour, a font and a corner radius. Per the decision
 * for Phase 7B the brand colour reaches ACCENTS ONLY (buttons, stars, links, the
 * hero overlay) — neutrals, headings and backgrounds stay on theme tokens, so a
 * poor colour choice can never make the page unreadable. Text on an accent is
 * picked automatically for contrast, and a colour that is too light to read as
 * link text on white is darkened until it is.
 *
 * This is the ONE place a runtime (tenant-chosen) colour exists outside
 * `theme.colors`; invalid input falls back to the default accent.
 */

import { colors } from '@/lib/theme/colors';
import { radius } from '@/lib/theme/tokens';

export const DEFAULT_ACCENT = colors.primary;

export const WEBSITE_FONT_KEYS = ['dm_sans', 'system_sans', 'serif'] as const;
export type WebsiteFontKey = (typeof WEBSITE_FONT_KEYS)[number];
export const DEFAULT_FONT_KEY: WebsiteFontKey = 'dm_sans';

export const WEBSITE_RADIUS_KEYS = ['none', 'sm', 'md', 'lg', 'full'] as const;
export type WebsiteRadiusKey = (typeof WEBSITE_RADIUS_KEYS)[number];
export const DEFAULT_RADIUS_KEY: WebsiteRadiusKey = 'md';

/** Quick-pick brand colours in the editor (any valid `#rrggbb` may also be typed). */
export const BRAND_PRESETS = [
  '#024751',
  '#1d4ed8',
  '#7c3aed',
  '#be185d',
  '#b91c1c',
  '#c2410c',
  '#15803d',
  '#374151',
] as const;

/** Strict `#rrggbb` (matches the database constraint). Returns lower-case, or null. */
export function parseHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  return /^#[0-9a-fA-F]{6}$/.test(input) ? input.toLowerCase() : null;
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes `a` towards `b` by `t` (0..1). */
export function mix(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return toHex([
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
  ]);
}

/**
 * The text colour for use ON `bg`: the theme's white or near-black, whichever
 * reads better; for a mid-tone where neither reaches 4.5:1, pure black (white
 * and black cannot both be below ~4.58:1, so this always passes).
 */
export function readableOn(bg: string): string {
  const best =
    contrastRatio(bg, colors.textOnPrimary) >= contrastRatio(bg, colors.textPrimary)
      ? colors.textOnPrimary
      : colors.textPrimary;
  if (contrastRatio(bg, best) >= 4.5) return best;
  return contrastRatio(bg, '#000000') > contrastRatio(bg, best) ? '#000000' : best;
}

/** Darkens `hex` until it reaches `min` contrast on `bg` (or is as dark as it gets). */
export function ensureContrast(hex: string, bg: string, min = 4.5): string {
  let current = hex;
  for (let i = 0; i < 20 && contrastRatio(current, bg) < min; i++) {
    current = mix(current, '#000000', 0.1);
  }
  return current;
}

export type WebsiteThemeInput = {
  brandColor?: string | null;
  fontKey?: string | null;
  radiusKey?: string | null;
};

export type ResolvedWebsiteTheme = {
  /** Fill for buttons and the hero overlay. */
  accent: string;
  accentHover: string;
  /** Text/icons ON the accent (white or near-black, whichever reads better). */
  onAccent: string;
  /** Accent usable as text or a thin line on the page background (>= 4.5:1). */
  accentText: string;
  /** A faint tint for chips and highlights. */
  accentLight: string;
  fontKey: WebsiteFontKey;
  radiusKey: WebsiteRadiusKey;
  /** Buttons / inputs. */
  controlRadius: number;
  /** Cards / images. */
  cardRadius: number;
};

const RADII: Record<WebsiteRadiusKey, { control: number; card: number }> = {
  none: { control: radius.none, card: radius.none },
  sm: { control: radius.sm, card: radius.md },
  md: { control: radius.md, card: radius.lg },
  lg: { control: radius.lg, card: radius.xl },
  full: { control: radius.full, card: radius.xl },
};

export function resolveFontKey(input: unknown): WebsiteFontKey {
  return (WEBSITE_FONT_KEYS as readonly string[]).includes(input as string)
    ? (input as WebsiteFontKey)
    : DEFAULT_FONT_KEY;
}

export function resolveRadiusKey(input: unknown): WebsiteRadiusKey {
  return (WEBSITE_RADIUS_KEYS as readonly string[]).includes(input as string)
    ? (input as WebsiteRadiusKey)
    : DEFAULT_RADIUS_KEY;
}

export function resolveWebsiteTheme(input: WebsiteThemeInput = {}): ResolvedWebsiteTheme {
  const accent = parseHexColor(input.brandColor) ?? DEFAULT_ACCENT;
  const radiusKey = resolveRadiusKey(input.radiusKey);
  return {
    accent,
    accentHover: mix(accent, '#000000', 0.12),
    onAccent: readableOn(accent),
    accentText: ensureContrast(accent, colors.surface, 4.5),
    accentLight: mix(accent, '#ffffff', 0.9),
    fontKey: resolveFontKey(input.fontKey),
    radiusKey,
    controlRadius: RADII[radiusKey].control,
    cardRadius: RADII[radiusKey].card,
  };
}

export type FontPlatform = 'ios' | 'android' | 'web';
export type FontOverride = {
  fontFamily: string;
  fontWeight?: '400' | '500' | '600' | '700';
} | null;

const WEIGHT_BY_DM_FAMILY: Record<string, '400' | '500' | '600' | '700'> = {
  DMSans_400Regular: '400',
  DMSans_500Medium: '500',
  DMSans_600SemiBold: '600',
  DMSans_700Bold: '700',
};

/**
 * The style override for a font key. `dm_sans` returns null (the theme's own
 * per-weight families apply). The two system choices must switch to fontWeight,
 * because the theme encodes weight in the DM Sans family name.
 */
export function fontOverride(
  fontKey: WebsiteFontKey,
  themeFamily: string,
  platform: FontPlatform,
): FontOverride {
  if (fontKey === 'dm_sans') return null;
  const fontWeight = WEIGHT_BY_DM_FAMILY[themeFamily] ?? '400';
  if (fontKey === 'serif') {
    const fontFamily =
      platform === 'ios'
        ? 'Georgia'
        : platform === 'android'
          ? 'serif'
          : 'Georgia, "Times New Roman", serif';
    return { fontFamily, fontWeight };
  }
  const fontFamily =
    platform === 'ios'
      ? 'System'
      : platform === 'android'
        ? 'sans-serif'
        : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  return { fontFamily, fontWeight };
}
