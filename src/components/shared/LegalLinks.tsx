import { Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { theme } from '@/lib/theme';

/**
 * Terms of Service + Privacy Policy links. The pages are static files on the public site
 * (`public/terms.html`, `public/privacy.html`), so they open as normal web pages on every platform.
 */
export function LegalLinks({ lead }: { lead?: string }) {
  const { t } = useTranslation();
  const open = (url: string) => void Linking.openURL(url);

  return (
    <View style={styles.wrap} accessibilityLabel={t('legal.linksLabel')}>
      {lead ? (
        <Text variant="helper" color="textMuted" align="center">
          {lead}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Text
          variant="helper"
          color="primary"
          accessibilityRole="link"
          onPress={() => open(brand.urls.terms)}
          style={styles.link}
        >
          {t('legal.terms')}
        </Text>
        <Text variant="helper" color="textMuted">
          ·
        </Text>
        <Text
          variant="helper"
          color="primary"
          accessibilityRole="link"
          onPress={() => open(brand.urls.privacy)}
          style={styles.link}
        >
          {t('legal.privacy')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: theme.spacing[4], paddingVertical: theme.spacing[8] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[8],
  },
  // Touch target >= 44px without changing the text size.
  link: { paddingVertical: theme.spacing[12] },
});
