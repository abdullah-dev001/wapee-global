import { useWindowDimensions } from 'react-native';

import { breakpoints } from './tokens';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/** Pure mapping from a width in px to a breakpoint name. */
export function getBreakpoint(width: number): Breakpoint {
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'mobile';
}

export type BreakpointInfo = {
  breakpoint: Breakpoint;
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Mobile or tablet (sidebar collapses). */
  isCompact: boolean;
};

/**
 * The ONLY way to branch layout (never Platform.OS).
 * mobile < 768, tablet 768–1023, desktop ≥ 1024. Re-renders on resize/rotation.
 */
export function useBreakpoint(): BreakpointInfo {
  const { width } = useWindowDimensions();
  const breakpoint = getBreakpoint(width);
  return {
    breakpoint,
    width,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isCompact: breakpoint !== 'desktop',
  };
}
