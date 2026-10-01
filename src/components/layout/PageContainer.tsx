import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Badge } from '@/components/ui';
import { Text } from '@/components/ui/Text';
import { theme, useBreakpoint } from '@/lib/theme';

export type PageContainerProps = {
  children: ReactNode;
  /** Page title (DESIGN_GUIDE §13.4). The header bar never shows the title. */
  title?: string;
  /** One line under the title. */
  subtitle?: string;
  /** Count pill beside the title, e.g. the number of rows. */
  count?: number;
  /** Buttons on the right of the title row; full width under it on mobile. */
  actions?: ReactNode;
  /** Cap the content width. Default is full width (DESIGN_GUIDE §13.1). */
  maxWidth?: number;
  style?: ViewStyle;
};

/**
 * Page padding and the title row. Sits inside `Screen`, which owns safe areas.
 * Padding is 24 on tablet/desktop and 16 on mobile (CLAUDE.md §5).
 */
export function PageContainer({
  children,
  title,
  subtitle,
  count,
  actions,
  maxWidth,
  style,
}: PageContainerProps) {
  const { isMobile } = useBreakpoint();
  const padding = isMobile ? theme.layout.pagePaddingMobile : theme.layout.pagePadding;

  return (
    <View style={[styles.container, { padding }, style]}>
      <View style={[styles.inner, maxWidth ? { maxWidth } : null]}>
        {title ? (
          <View style={[styles.header, isMobile ? styles.headerMobile : styles.headerWide]}>
            <View style={styles.titleBlock}>
              <View style={styles.titleRow}>
                <Text variant={isMobile ? 'pageTitleMobile' : 'pageTitle'}>{title}</Text>
                {count !== undefined ? <Badge tone="neutral">{String(count)}</Badge> : null}
              </View>
              {subtitle ? (
                <Text variant="body" color="textSecondary">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {actions ? (
              <View style={[styles.actions, isMobile ? styles.actionsMobile : null]}>
                {actions}
              </View>
            ) : null}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    flex: 1,
  },
  header: {
    marginBottom: theme.spacing[24],
    gap: theme.spacing[16],
  },
  headerWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: theme.spacing[14],
  },
  titleBlock: {
    flex: 1,
    gap: theme.spacing[4],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  actionsMobile: {
    alignSelf: 'stretch',
  },
});
