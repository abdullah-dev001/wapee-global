import { colors } from './colors';
import {
  borderWidth,
  breakpoints,
  controlHeight,
  duration,
  iconSize,
  iconStroke,
  layout,
  opacity,
  radius,
  spacing,
  zIndex,
} from './tokens';
import { fontFamily, fontSize, letterSpacingEm, lineHeight, textVariants } from './typography';

/** The typed theme object. Components read every visual value from here. */
export const theme = {
  colors,
  spacing,
  layout,
  radius,
  borderWidth,
  controlHeight,
  iconSize,
  iconStroke,
  duration,
  opacity,
  zIndex,
  breakpoints,
  font: {
    family: fontFamily,
    size: fontSize,
    lineHeight,
    letterSpacingEm,
  },
  text: textVariants,
} as const;

export type Theme = typeof theme;

export { colors } from './colors';
export { shadow, focusRing, type ShadowLevel } from './shadow';
export {
  useBreakpoint,
  getBreakpoint,
  type Breakpoint,
  type BreakpointInfo,
} from './useBreakpoint';
export { useAppFonts } from './fonts';
export { letterSpacing, type TextVariant } from './typography';
