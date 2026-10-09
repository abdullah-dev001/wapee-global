import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout';
import { Card, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { shadow, theme } from '@/lib/theme';

export type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Line under the card, e.g. "New to Wapee? Create an account". */
  footer?: ReactNode;
};

/**
 * Centred card used by every auth screen (DESIGN_GUIDE §13.8):
 * wordmark, a 400px card with a small shadow, then a footer line.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.page}>
        <View style={styles.stack}>
          <Text variant="pageTitle" color="primary" align="center">
            {brand.name}
          </Text>

          <Card style={[styles.card, shadow('sm')]}>
            <View style={styles.header}>
              <Text variant="authTitle">{title}</Text>
              {subtitle ? (
                <Text variant="body" color="textSecondary">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {children}
          </Card>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Padding lives here, not on Screen's content container: Screen sets
  // paddingStart/End (0), which beat a plain `padding` and left the card flush.
  page: {
    width: '100%',
    alignItems: 'center',
    padding: theme.layout.pagePaddingMobile,
  },
  stack: {
    width: '100%',
    maxWidth: theme.layout.authCardMaxWidth,
    gap: theme.spacing[24],
  },
  card: {
    width: '100%',
  },
  header: {
    gap: theme.spacing[6],
    marginBottom: theme.spacing[24],
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing[5],
  },
});
