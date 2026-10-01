/** Non-colour, non-type tokens. Source: CLAUDE.md §5 and docs/DESIGN_GUIDE.md §4–§10. */

/** Spacing scale in px (DESIGN_GUIDE §4, quarter-rem grid). Key = value in px. */
export const spacing = {
  0: 0,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Layout tokens (DESIGN_GUIDE §4 "Layout tokens"). */
export const layout = {
  pagePadding: 24,
  pagePaddingMobile: 16,
  cardPadding: 24,
  cardPaddingMobile: 18,
  sidebarWidth: 240,
  headerHeight: 64,
  drawerWidth: 480,
  dialogMaxWidth: 416,
  authCardMaxWidth: 400,
  settingsMaxWidth: 768,
  /** Minimum touch target on mobile (CLAUDE.md §4). */
  minTouchTarget: 44,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

export const borderWidth = {
  hairline: 1,
  thick: 2,
} as const;

/** Control heights (CLAUDE.md §5 component specs). */
export const controlHeight = {
  sm: 34,
  md: 41,
  lg: 48,
  input: 40,
} as const;

export const iconSize = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 22,
} as const;

export const iconStroke = 1.75;

/** Motion durations in ms; easing is always `ease` (animate colour/opacity only). */
export const duration = {
  fast: 120,
  base: 180,
  slow: 260,
  spinner: 600,
  skeletonPulse: 1400,
} as const;

export const opacity = {
  disabled: 0.55,
  refetching: 0.6,
  skeletonLow: 0.45,
} as const;

export const zIndex = {
  header: 30,
  sidebar: 40,
  overlay: 50,
  drawer: 60,
  toast: 70,
} as const;

/** Breakpoints (CLAUDE.md §4): mobile < 768, tablet 768–1023, desktop ≥ 1024. */
export const breakpoints = {
  tablet: 768,
  desktop: 1024,
} as const;
