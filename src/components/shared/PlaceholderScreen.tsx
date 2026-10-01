import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brand } from '@/config/brand';
import { theme, useBreakpoint } from '@/lib/theme';

type PlaceholderScreenProps = {
  title: string;
};

/**
 * TEMPORARY Phase 0 placeholder for route groups. Delete once real screens and the
 * shared `Screen` layout exist. Shows the route name, active breakpoint and font check.
 */
export function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { breakpoint, width, isMobile } = useBreakpoint();
  const padding = isMobile ? theme.layout.pagePaddingMobile : theme.layout.pagePadding;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + padding,
          paddingBottom: insets.bottom + padding,
          paddingStart: insets.left + padding,
          paddingEnd: insets.right + padding,
        },
      ]}
    >
      <View
        style={[
          styles.card,
          { padding: isMobile ? theme.layout.cardPaddingMobile : theme.layout.cardPadding },
        ]}
      >
        <Text style={[isMobile ? theme.text.pageTitleMobile : theme.text.pageTitle, styles.title]}>
          {title}
        </Text>
        <Text style={styles.description}>
          {t('placeholder.description', { appName: brand.name })}
        </Text>
        <Text style={styles.meta}>
          {breakpoint} · {Math.round(width)}px
        </Text>
        <View style={styles.links}>
          <Link href="/" style={styles.link}>
            {t('routes.app')}
          </Link>
          <Link href="/login" style={styles.link}>
            {t('routes.auth')}
          </Link>
          <Link href="/demo-salon" style={styles.link}>
            {t('routes.public', { slug: 'demo-salon' })}
          </Link>
          <Link href="/portal" style={styles.link}>
            {t('routes.portal')}
          </Link>
          <Link href="/admin" style={styles.link}>
            {t('routes.admin')}
          </Link>
          {__DEV__ ? (
            <Link href="/_gallery" style={styles.link}>
              Component gallery (dev)
            </Link>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: theme.layout.dialogMaxWidth,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.borderWidth.hairline,
    borderRadius: theme.radius.lg,
    gap: theme.spacing[8],
  },
  title: {
    color: theme.colors.textPrimary,
  },
  description: {
    ...theme.text.body,
    color: theme.colors.textSecondary,
  },
  meta: {
    ...theme.text.caption,
    color: theme.colors.textMuted,
  },
  links: {
    marginTop: theme.spacing[8],
    gap: theme.spacing[12],
  },
  link: {
    ...theme.text.bodyStrong,
    color: theme.colors.primary,
  },
});
