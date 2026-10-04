import { theme, useBreakpoint } from '@/lib/theme';

/**
 * The horizontal page padding `PageContainer` uses: 24, or 16 on mobile
 * (CLAUDE.md §5).
 *
 * A screen that puts a `flex: 1` body BESIDE `PageContainer` (Calendar,
 * Clients, Today) must pad that body itself, and it has to be the same number
 * or the body sits out of line with the page title. Hard-coding
 * `theme.layout.pagePadding` there left the body 8px wider than the title on
 * every phone, so the single source of truth lives here instead.
 */
export function usePagePadding(): number {
  const { isMobile } = useBreakpoint();
  return isMobile ? theme.layout.pagePaddingMobile : theme.layout.pagePadding;
}
