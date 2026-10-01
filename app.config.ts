import { type ConfigContext, type ExpoConfig } from 'expo/config';

import { brand } from './src/config/brand.ts';

// Theme values duplicated here on purpose: app config runs in Node at build time.
// Keep in sync with src/lib/theme/colors.ts.
const PRIMARY = '#024751';
const BACKGROUND = '#f8fafb';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: brand.name,
  slug: brand.slug,
  scheme: brand.scheme,
  version: '1.0.0',
  // Phones are portrait-locked. iPad allows all orientations (see ios.infoPlist).
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: BACKGROUND,
  ios: {
    bundleIdentifier: brand.bundleId,
    supportsTablet: true,
    infoPlist: {
      'UISupportedInterfaceOrientations~ipad': [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: brand.bundleId,
    // Edge-to-edge is always on in SDK 54+; insets are handled with react-native-safe-area-context.
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon-foreground.png',
      monochromeImage: './assets/images/adaptive-icon-monochrome.png',
      backgroundColor: PRIMARY,
    },
    // Kept off until the shared back handling (sheets/dialogs first) is built and tested with it.
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
    name: brand.name,
    shortName: brand.name,
    description: brand.description,
    themeColor: PRIMARY,
    backgroundColor: BACKGROUND,
  },
  plugins: [
    'expo-router',
    // Phones stay portrait (orientation above). Tablets may rotate; on Android the
    // lock is released at runtime for large screens (see useTabletOrientation).
    'expo-screen-orientation',
    'expo-localization',
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: PRIMARY,
      },
    ],
    // 'dark' = dark buttons on a light bar (windowLightNavigationBar=true),
    // which suits our light screens. enforceContrast must be false for
    // Screen's runtime setStyle to take effect.
    ['expo-navigation-bar', { style: 'dark', enforceContrast: false }],
    'expo-notifications',
  ],
  experiments: {
    typedRoutes: true,
    tsconfigPaths: true,
  },
});
