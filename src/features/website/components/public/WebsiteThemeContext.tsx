import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { resolveWebsiteTheme, type ResolvedWebsiteTheme } from '../../websiteTheme';

type WebsiteContextValue = {
  theme: ResolvedWebsiteTheme;
  /** BCP-47, for weekday names, money and durations. */
  locale: string;
  /** Show Book buttons (booking settings + branch bookable). */
  bookable: boolean;
  currency: string;
  onBook: () => void;
};

const WebsiteContext = createContext<WebsiteContextValue | null>(null);

export function WebsiteProvider({
  brandColor,
  fontKey,
  radiusKey,
  locale,
  bookable,
  currency,
  onBook,
  children,
}: {
  brandColor?: string | null;
  fontKey?: string | null;
  radiusKey?: string | null;
  locale: string;
  bookable: boolean;
  currency: string;
  onBook: () => void;
  children: ReactNode;
}) {
  const value = useMemo<WebsiteContextValue>(
    () => ({
      theme: resolveWebsiteTheme({ brandColor, fontKey, radiusKey }),
      locale,
      bookable,
      currency,
      onBook,
    }),
    [brandColor, fontKey, radiusKey, locale, bookable, currency, onBook],
  );
  return <WebsiteContext.Provider value={value}>{children}</WebsiteContext.Provider>;
}

export function useWebsiteTheme(): WebsiteContextValue {
  const context = useContext(WebsiteContext);
  if (!context) throw new Error('useWebsiteTheme must be used inside <WebsiteProvider>.');
  return context;
}
