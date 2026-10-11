import * as Clipboard from 'expo-clipboard';
import { Copy } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Dialog, Text, useToast } from '@/components/ui';
import { brand } from '@/config/brand';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';

/** The signing link, shown ONCE after it is created (the database keeps only its hash). */
export function RequestLinkDialog({
  link,
  onClose,
}: {
  link: { token: string; queued: boolean } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { business } = useCurrentScope();
  const url =
    link && business
      ? `${brand.urls.site.replace(/\/+$/, '')}/${business.slug}/sign#token=${encodeURIComponent(link.token)}`
      : null;

  return (
    <Dialog
      open={Boolean(url)}
      onClose={onClose}
      title={t('forms.link.title')}
      cancelLabel={t('actions.done')}
    >
      <View style={styles.stack}>
        <Text variant="small" color="textSecondary">
          {t(link?.queued ? 'forms.link.emailed' : 'forms.link.message')}
        </Text>
        <View style={styles.url}>
          <Text variant="small" selectable>
            {url ?? ''}
          </Text>
        </View>
        <Text variant="helper" color="textMuted">
          {t('forms.link.once')}
        </Text>
        <Button
          variant="secondary"
          startIcon={Copy}
          onPress={() => {
            if (!url) return;
            void Clipboard.setStringAsync(url).then(() =>
              toast.show({ message: t('forms.link.copied'), tone: 'success' }),
            );
          }}
        >
          {t('forms.link.copy')}
        </Button>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing[12] },
  url: {
    padding: theme.spacing[12],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceHover,
  },
});
