import { Easing } from 'remotion';

/**
 * Single source of truth for brand copy, assets and design tokens.
 * Rename the product here only.
 */
export const BRAND = {
  name: 'Wapee',
  // Public business websites domain (placeholder, matches the app's brand config).
  siteDomain: 'wapee.site',
  tagline: 'Your whole appointment business. Set up in minutes.',
  cta: 'Start your 14-day free trial',
} as const;

/** Optional assets, relative to /showreel/public. Set to null to disable. */
export const MUSIC: string | null = null;
export const LOGO: string | null = null;

export const VIDEO = { width: 1920, height: 1080, fps: 30, durationInFrames: 1110 } as const;

export const C = {
  teal: '#024751',
  tealHover: '#013640',
  tealLight: '#e6f0f2',
  tealMuted: '#a8c5ca',
  tealLine: '#035f6e',
  lime: '#d8ff29',
  limeLight: '#f6ffd6',
  bg: '#f8fafb',
  surface: '#ffffff',
  surfaceHover: '#f3f4f6',
  border: '#e5e7eb',
  borderSubtle: '#f0f0f0',
  text: '#111827',
  text2: '#6b7280',
  text3: '#9ca3af',
  success: '#10b981',
  successLight: '#ecfdf5',
  successBorder: '#a7f3d0',
  warning: '#b45309',
  warningLight: '#fffbeb',
  warningBorder: '#fde68a',
} as const;

export const FONT = "'DM Sans', system-ui, sans-serif";

export const TYPE = {
  headline: { fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.02 },
  body: { letterSpacing: '-0.02em' },
} as const;

export const RADIUS = { md: 8, lg: 12, card: 24, full: 9999 } as const;

export const SHADOW = {
  card: '0 1px 2px rgba(2, 71, 81, 0.04), 0 12px 32px -8px rgba(2, 71, 81, 0.12), 0 40px 80px -24px rgba(2, 71, 81, 0.16)',
  float: '0 2px 4px rgba(2, 71, 81, 0.06), 0 24px 48px -12px rgba(2, 71, 81, 0.22)',
  onTeal: '0 2px 4px rgba(0, 0, 0, 0.08), 0 30px 60px -20px rgba(0, 0, 0, 0.35)',
} as const;

export const ICON = { strokeWidth: 1.75 } as const;

/** The one easing curve used for every animation. */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const CROSSFADE = 12;

/** Scene lengths in frames; they sum to VIDEO.durationInFrames. */
export const SCENES = {
  hook: 90,
  booking: 180,
  calendar: 150,
  notifications: 150,
  money: 150,
  website: 150,
  industries: 120,
  close: 120,
} as const;
