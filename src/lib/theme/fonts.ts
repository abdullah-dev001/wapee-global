import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';

import { fontFamily } from './typography';

/** Font files keyed by the family names used in `typography.fontFamily`. */
const fontMap = {
  [fontFamily.regular]: DMSans_400Regular,
  [fontFamily.medium]: DMSans_500Medium,
  [fontFamily.semibold]: DMSans_600SemiBold,
  [fontFamily.bold]: DMSans_700Bold,
};

/**
 * Loads DM Sans (400/500/600/700). Returns `[loaded, error]`.
 * Callers keep the splash screen up until `loaded || error`.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts(fontMap);
}
