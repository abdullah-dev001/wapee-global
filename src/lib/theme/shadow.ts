import { Platform, type ViewStyle } from 'react-native';

import { colors } from './colors';

/**
 * Elevation levels (DESIGN_GUIDE §7). Shadows tint #111827, never pure black.
 * Web uses the exact CSS values; iOS uses the strongest layer as shadow* props;
 * Android uses elevation.
 */
const levels = {
  sm: {
    web: '0 1px 2px 0 rgba(17, 24, 39, 0.05)',
    ios: { offsetX: 0, offsetY: 1, radius: 2, opacity: 0.05 },
    elevation: 1,
  },
  md: {
    web: '0 4px 6px -1px rgba(17, 24, 39, 0.07), 0 2px 4px -2px rgba(17, 24, 39, 0.05)',
    ios: { offsetX: 0, offsetY: 4, radius: 6, opacity: 0.07 },
    elevation: 3,
  },
  lg: {
    web: '0 10px 15px -3px rgba(17, 24, 39, 0.08), 0 4px 6px -4px rgba(17, 24, 39, 0.05)',
    ios: { offsetX: 0, offsetY: 10, radius: 15, opacity: 0.08 },
    elevation: 8,
  },
  drawer: {
    web: '-8px 0 24px -4px rgba(17, 24, 39, 0.12)',
    ios: { offsetX: -8, offsetY: 0, radius: 24, opacity: 0.12 },
    elevation: 16,
  },
} as const;

export type ShadowLevel = keyof typeof levels;

/** Returns the platform-correct shadow style for a level. Cards are flat by default. */
export function shadow(level: ShadowLevel): ViewStyle {
  const spec = levels[level];
  return (
    Platform.select<ViewStyle>({
      web: { boxShadow: spec.web },
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: spec.ios.offsetX, height: spec.ios.offsetY },
        shadowOpacity: spec.ios.opacity,
        shadowRadius: spec.ios.radius,
      },
      android: { elevation: spec.elevation, shadowColor: colors.shadow },
    }) ?? {}
  );
}

/** Input focus ring: `0 0 0 3px primary-light` on web; border colour carries focus on native. */
export function focusRing(): ViewStyle {
  return Platform.OS === 'web' ? { boxShadow: `0 0 0 3px ${colors.primaryLight}` } : {};
}
