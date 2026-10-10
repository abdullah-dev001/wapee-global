import * as Clipboard from 'expo-clipboard';
import { Copy } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, Text, useToast } from '@/components/ui';
import { brand } from '@/config/brand';
import { reviewUrl } from '@/features/website/links';
import { useCurrentScope } from '@/lib/permissions';
import { theme } from '@/lib/theme';
import { formatDate, type UtcIso } from '@/lib/time';

import { useReviewLinkStore } from '../reviewLinkStore';

/**
 * Mounted once in the app shell. Shows the customer's review link when a
 * completion (or "get link again") produced one, with a copy button. Nothing is
 * sent from here (email/SMS is Phase 6): the owner copies it to the customer.
 */
export function ReviewLinkDialogHost() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { business } = useCurrentScope();
  const link = useReviewLinkStore((s) => s.link);
  const hide = useReviewLinkStore((s) => s.hide);

  // The raw token must not outlive the signed-in session.
  useEffect(() => hide, [hide]);

  const url = link && business ? reviewUrl(brand.urls.site, business.slug, link.token) : null;

  const copy = async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    toast.show({ message: t('reviews.link.copied'), tone: 'success' });
  };

  return (
    <Dialog
      open={Boolean(url)}
      onClose={hide}
      title={t('reviews.link.title')}
      cancelLabel={t('actions.done')}
    >
      <View style={styles.body}>
        <Text variant="small" color="textSecondary">
          {t('reviews.link.message')}
        </Text>
        <View style={styles.url}>
          <Text variant="small" selectable>
            {url ?? ''}
          </Text>
        </View>
        {link ? (
          <Text variant="helper" color="textMuted">
            {t('reviews.link.expires', {
              date: formatDate(
                link.expiresAt as UtcIso,
                business?.branches[0]?.timezone ?? 'UTC',
                i18n.language,
                'medium',
              ),
            })}
          </Text>
        ) : null}
        <Button variant="secondary" startIcon={Copy} onPress={() => void copy()}>
          {t('reviews.link.copy')}
        </Button>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.spacing[12] },
  url: {
    padding: theme.spacing[12],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceHover,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
  },
});
