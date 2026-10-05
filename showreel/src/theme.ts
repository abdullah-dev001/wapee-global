import { Easing } from 'remotion';

/**
 * Brand copy, optional assets and design tokens. Rename the product here only.
 * Event timing lives in timeline.ts; story content in content.ts.
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

export const C = {
  teal: '#024751',
  tealHover: '#013640',
  tealLight: '#e6f0f2',
  tealMuted: '#a8c5ca',
  tealLine: '#035f6e',
  tealGlow: '77, 168, 180',
  lime: '#d8ff29',
  limeHover: '#c4eb1a',
  limeLight: '#f6ffd6',
  bg: '#f8fafb',
  surface: '#ffffff',
  surfaceHover: '#f3f4f6',
  border: '#e5e7eb',
  borderSubtle: '#f0f0f0',
  text: '#111827',
  /** Secondary text: 4.8:1 on white. The guide's #9ca3af muted text fails 4.5:1, so it is not used for text. */
  text2: '#6b7280',
  success: '#10b981',
  /** Darker than the guide's success text so badges pass 4.5:1. */
  successText: '#047857',
  successLight: '#ecfdf5',
  successBorder: '#a7f3d0',
  warning: '#b45309',
  warningLight: '#fffbeb',
  warningBorder: '#fde68a',
  star: '#f59e0b',
} as const;

export const FONT = "'DM Sans', system-ui, sans-serif";

/** One size per role. Every feature scene uses `headline`; the hook uses `display`. */
export const TYPE = {
  display: 168,
  wordmark: 220,
  headline: 104,
  lead: 44,
  body: 30,
  headlineStyle: { fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.02 },
  bodyStyle: { letterSpacing: '-0.02em' },
} as const;

/** The app's UI (DESIGN_GUIDE.md) is drawn at this scale so 13–14px app text reads at 1080p. */
export const UI_SCALE = 1.6;
export const ui = (px: number, scale: number = UI_SCALE) => Math.round(px * scale * 10) / 10;

export const RADIUS = { md: ui(8), lg: ui(12), card: 24, full: 9999 } as const;

/** Key (tight, directional) + ambient (wide, soft) layers, teal-tinted. */
export const SHADOW = {
  card: '0 6px 14px -6px rgba(2, 71, 81, 0.16), 0 30px 60px -24px rgba(2, 71, 81, 0.24)',
  float: '0 10px 22px -8px rgba(2, 71, 81, 0.26), 0 36px 72px -24px rgba(2, 71, 81, 0.32)',
  onTeal: '0 10px 24px -10px rgba(0, 18, 22, 0.42), 0 40px 80px -28px rgba(0, 14, 18, 0.55)',
} as const;

/** Horizontal safe margin for every layout; nothing important sits closer to the edge. */
export const SAFE = { x: 150, y: 120 } as const;

export const ICON = { strokeWidth: 1.75 } as const;

/** The one easing curve for UI motion (no overshoot). */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Cursor travel and scene transitions: gentle start, soft landing, no overshoot (so both scenes are seen moving together). */
export const EASE_MOVE = Easing.bezier(0.45, 0, 0.2, 1);

/** Stagger rhythm: words in a headline, and items in a list or row. */
export const STAGGER = { words: 4, items: 6 } as const;

export type Tone = 'teal' | 'light';

/** Scene order, lengths (frames) and background tone. The video length is the sum. */
export const SCENES = {
  hook: { frames: 90, tone: 'teal' },
  booking: { frames: 180, tone: 'light' },
  calendar: { frames: 150, tone: 'light' },
  notifications: { frames: 150, tone: 'teal' },
  clients: { frames: 150, tone: 'light' },
  money: { frames: 150, tone: 'light' },
  packages: { frames: 150, tone: 'teal' },
  forms: { frames: 150, tone: 'light' },
  reviews: { frames: 90, tone: 'teal' },
  website: { frames: 150, tone: 'light' },
  team: { frames: 150, tone: 'teal' },
  industries: { frames: 120, tone: 'light' },
  close: { frames: 120, tone: 'teal' },
} as const satisfies Record<string, { frames: number; tone: Tone }>;

export type SceneKey = keyof typeof SCENES;
export const SCENE_ORDER = Object.keys(SCENES) as SceneKey[];

/**
 * Transition types: `push` between scenes of the same tone, `scale` (scale-through)
 * when the tone changes, `fade` into the closing logo. Values are overlap lengths in frames.
 */
export const TRANSITIONS = { push: 18, scale: 16, fade: 20 } as const;
export type TransitionType = keyof typeof TRANSITIONS;

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: SCENE_ORDER.reduce((sum, k) => sum + SCENES[k].frames, 0),
} as const;
