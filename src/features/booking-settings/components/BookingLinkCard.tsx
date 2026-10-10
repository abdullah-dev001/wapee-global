import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Copy, Link2 } from 'lucide-react-native';

import { Badge, Button, Card, Text, useToast } from '@/components/ui';
import { brand } from '@/config/brand';
import { useWebsiteAdmin } from '@/features/website/api/useWebsiteAdmin';
import { useCurrentScope, usePermission } from '@/lib/permissions';
import { theme } from '@/lib/theme';

import { bookingUrl } from '../bookingWarnings';

export type BookingLinkCardProps = {
  businessSlug: string | null;
  /** From `branch_is_bookable()`. Gates whether the link is presented as live. */
  isLive: boolean;
};

/**
 * The public booking URL, with a copy button.
 *
 * **While the branch is not bookable the link is shown greyed out, with a reason,
 * and copying is disabled** (the user's rule, 2026-10-03). The alternative — an
 * active-looking link that loads a page offering nothing — reads as broken
 * software rather than as unfinished setup, and once it has been pasted into a
 * social-media bio nobody goes back to check.
 */
export function BookingLinkCard({ businessSlug, isLive }: BookingLinkCardProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { businessId } = useCurrentScope();
  // Only people who can read the website row can know it is unpublished (RLS hides it
  // from everyone else), so the note is shown to them alone rather than guessed.
  const canSeeWebsite = usePermission('website.edit');
  const site = useWebsiteAdmin(canSeeWebsite.allowed ? businessId : null);
  const websiteUnpublished =
    canSeeWebsite.allowed && site.isSuccess && site.data.website?.isPublished !== true;

  const url = businessSlug ? bookingUrl(brand.urls.site, businessSlug) : null;

  const copy = useCallback(async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    toast.show({ message: t('bookingSettings.linkCopied'), tone: 'success' });
  }, [url, t, toast]);

  if (!url) return null;

  return (
    <Card>
      <View style={styles.wrapper}>
        <View style={styles.titleRow}>
          <Link2
            size={theme.iconSize.md}
            strokeWidth={theme.iconStroke}
            color={theme.colors.textSecondary}
          />
          <Text variant="cardTitle" color="textPrimary">
            {t('bookingSettings.link')}
          </Text>
          {!isLive ? <Badge tone="warning">{t('bookingSettings.linkNotReady')}</Badge> : null}
        </View>

        <Text
          variant="body"
          // Greyed while not live, so the state is visible and not only stated.
          color={isLive ? 'textPrimary' : 'textMuted'}
          // The URL is the one string here that must never be translated or
          // truncated mid-copy, so it wraps rather than ellipsing.
          selectable={isLive}
          style={styles.url}
        >
          {url}
        </Text>

        <Text variant="helper" color="textSecondary">
          {t('bookingSettings.linkHint')}
        </Text>

        {websiteUnpublished ? (
          <Text variant="helper" color="textSecondary">
            {t('bookingSettings.websiteNotPublished')}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            startIcon={Copy}
            onPress={copy}
            // Copying a dead link is the specific mistake this card prevents.
            disabled={!isLive}
          >
            {t('bookingSettings.linkCopy')}
          </Button>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing[8],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    flexWrap: 'wrap',
  },
  url: {
    // A long slug on a 320px screen must wrap, not overflow.
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing[8],
    marginTop: theme.spacing[4],
  },
});
