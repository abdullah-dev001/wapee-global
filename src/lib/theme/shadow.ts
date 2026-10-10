import { Platform, type ViewStyle } from 'react-native';

import { colors } from './colors';
import { shadowLevels } from './shadowLevels';

const levels = shadowLevels;

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
