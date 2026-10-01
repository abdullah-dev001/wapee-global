import 'i18next';

import { type defaultNS, type resources } from './resources';

// Typed `t()` keys: a missing key is a type error.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}
