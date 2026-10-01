import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

import { brand } from '@/config/brand';
import { colors } from '@/lib/theme/colors';

/**
 * Web-only HTML shell for static rendering. Runs in Node at build time only:
 * no browser APIs here. Not used on native.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover lets the standalone PWA use env(safe-area-inset-*) like the native app. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />
        <title>{brand.name}</title>
        <meta name="description" content={brand.description} />
        <meta name="theme-color" content={colors.primary} />
        <meta name="application-name" content={brand.name} />

        {/* iOS standalone web app */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={brand.name} />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />

        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: baseCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const baseCss = `
html, body { background-color: ${colors.background}; }
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: none;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
