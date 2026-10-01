import { Download, Share, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { brand } from '@/config/brand';
import { useInstallPrompt } from '@/lib/pwa/useInstallPrompt';
import { theme } from '@/lib/theme';

/**
 * Dismissible "Install app" bar (web only, CLAUDE.md §4).
 * Chromium gets a real Install button; iOS Safari gets the
 * "Share → Add to Home Screen" instruction, since it has no install prompt.
 */
export function InstallHint() {
  const { t } = useTranslation();
  const { visible, needsManualInstructions, install, dismiss } = useInstallPrompt();

  if (Platform.OS !== 'web' || !visible) return null;

  return (
    <View style={styles.bar} accessibilityRole="alert">
      <View style={styles.icon}>
        {needsManualInstructions ? (
          <Share
            size={theme.iconSize.sm}
            strokeWidth={theme.iconStroke}
            color={theme.colors.primary}
          />
        ) : (
          <Download
            size={theme.iconSize.sm}
            strokeWidth={theme.iconStroke}
            color={theme.colors.primary}
          />
        )}
      </View>

      <View style={styles.textBlock}>
        <Text variant="label">{t('pwa.installTitle', { appName: brand.name })}</Text>
        <Text variant="helper" color="textSecondary">
          {needsManualInstructions ? t('pwa.installIosBody') : t('pwa.installBody')}
        </Text>
      </View>

      {needsManualInstructions ? null : (
        <Button size="sm" onPress={install}>
          {t('pwa.installAction')}
        </Button>
      )}

      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={t('actions.close')}
        style={styles.close}
      >
        <X size={theme.iconSize.sm} strokeWidth={2} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[16],
    backgroundColor: theme.colors.primaryLight,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: theme.spacing[2],
  },
  close: {
    padding: theme.spacing[4],
  },
});
