import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
  type AppLanguage,
  defaultNS,
  fallbackLng,
  namespaces,
  resources,
  supportedLanguages,
} from './resources';

/** First device language we support, else English. Business/user language overrides this later. */
export function detectLanguage(): AppLanguage {
  const deviceCodes = getLocales()
    .map((locale) => locale.languageCode)
    .filter((code): code is string => Boolean(code));
  const match = deviceCodes.find((code): code is AppLanguage =>
    (supportedLanguages as string[]).includes(code),
  );
  return match ?? fallbackLng;
}

/** The app's i18next instance (also passed to I18nextProvider). */
export const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng,
  ns: namespaces,
  defaultNS,
  // Resources are bundled, so init is synchronous (no flash of keys).
  initAsync: false,
  interpolation: { escapeValue: false }, // React already escapes.
  returnNull: false,
});

export { applyDirection, getDirection, isRtl, type TextDirection } from './direction';
export { supportedLanguages, type AppLanguage } from './resources';
