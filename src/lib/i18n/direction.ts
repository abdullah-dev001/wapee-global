import { I18nManager, Platform } from 'react-native';

/** Languages written right-to-left (base language subtags). */
const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku']);

export type TextDirection = 'ltr' | 'rtl';

/** Direction for a language tag such as "ar" or "ur-PK". */
export function getDirection(language: string): TextDirection {
  const base = language.toLowerCase().split('-')[0] ?? '';
  return RTL_LANGUAGES.has(base) ? 'rtl' : 'ltr';
}

export function isRtl(language: string): boolean {
  return getDirection(language) === 'rtl';
}

/**
 * Applies text direction for a language.
 * - Web: sets `dir` and `lang` on <html> (guarded for static rendering).
 * - Native: sets I18nManager. A direction change on native only takes effect
 *   after an app reload; returns true when a reload is needed.
 */
export function applyDirection(language: string): boolean {
  const direction = getDirection(language);
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = direction;
      document.documentElement.lang = language;
    }
    return false;
  }
  const wantRtl = direction === 'rtl';
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === wantRtl) return false;
  I18nManager.forceRTL(wantRtl);
  return true;
}
