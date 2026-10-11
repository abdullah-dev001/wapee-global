import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme, useBreakpoint } from '@/lib/theme';

import { WText } from './WText';

export const WEBSITE_MAX_WIDTH = 960;

/** Centred column with the page gutters; every section sits in one. */
export function SectionShell({
  title,
  children,
  tinted = false,
}: {
  title?: string | null;
  children: ReactNode;
  /** A faint band behind the section, to separate it from its neighbours. */
  tinted?: boolean;
}) {
  const { isMobile } = useBreakpoint();
  const gutter = isMobile ? theme.layout.pagePaddingMobile : theme.layout.pagePadding;

  return (
    <View style={tinted ? styles.tinted : null}>
      <View
        style={[
          styles.inner,
          {
            paddingHorizontal: gutter,
            paddingVertical: isMobile ? theme.spacing[32] : theme.spacing[48],
          },
        ]}
      >
        {title ? (
          <WText variant={isMobile ? 'pageTitleMobile' : 'pageTitle'} accessibilityRole="header">
            {title}
          </WText>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tinted: { backgroundColor: theme.colors.surface },
  inner: {
    width: '100%',
    maxWidth: WEBSITE_MAX_WIDTH,
    alignSelf: 'center',
    gap: theme.spacing[20],
  },
});
