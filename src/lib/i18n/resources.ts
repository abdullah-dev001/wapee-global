import enCommon from './locales/en/common.json';

/**
 * All translation resources. One JSON file per namespace per language:
 *   locales/<lang>/<namespace>.json
 * To add a namespace (e.g. "clients"): create locales/en/clients.json, import it
 * here and add it to `en`. To add a language: add a folder and an entry below.
 */
export const resources = {
  en: {
    common: enCommon,
  },
} as const;

export const defaultNS = 'common';
export const fallbackLng = 'en';

export type AppLanguage = keyof typeof resources;
export const supportedLanguages = Object.keys(resources) as AppLanguage[];
export const namespaces = Object.keys(resources.en) as (keyof (typeof resources)['en'])[];
