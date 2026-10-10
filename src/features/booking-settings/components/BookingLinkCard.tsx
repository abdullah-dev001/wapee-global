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

/** One location, for the per-location links. */
export type BookingLinkBranch = {
  id: string;
  name: string;
  /** The short code in `?branch=` (the location's invoice prefix). */
  code: string;
  /** From `branch_is_bookable()` for THIS location. */
  isLive: boolean;
};

export type BookingLinkCardProps = {
  businessSlug: string | null;
  /** From `branch_is_bookable()`. Gates whether the link is presented as live. */
  isLive: boolean;
  /** Every location of the business. With two or more, a link per location is listed. */
  branches?: readonly BookingLinkBranch[];
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
export function BookingLinkCard({ businessSlug, isLive, branches = [] }: BookingLinkCardProps) {
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

  const copyBranch = useCallback(
    async (code: string) => {
      if (!businessSlug) return;
      await Clipboard.setStringAsync(bookingUrl(brand.urls.site, businessSlug, code));
      toast.show({ message: t('bookingSettings.linkCopied'), tone: 'success' });
    },
    [businessSlug, t, toast],
  );

  const hasLocations = branches.length > 1;

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
          {hasLocations ? t('bookingSettings.linkMainHint') : t('bookingSettings.linkHint')}
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

        {hasLocations && businessSlug ? (
          <View style={styles.locations}>
            <Text variant="bodyStrong" color="textPrimary">
              {t('bookingSettings.linkLocations')}
            </Text>
            <Text variant="helper" color="textSecondary">
              {t('bookingSettings.linkLocationsHint')}
            </Text>
            {branches.map((branch) => (
              <View key={branch.id} style={styles.locationRow}>
                <View style={styles.locationText}>
                  <View style={styles.titleRow}>
                    <Text variant="bodyStrong" color="textPrimary">
                      {branch.name}
                    </Text>
                    {!branch.isLive ? (
                      <Badge tone="warning">{t('bookingSettings.linkLocationNotReady')}</Badge>
                    ) : null}
                  </View>
                  <Text
                    variant="helper"
                    color={branch.isLive ? 'textSecondary' : 'textMuted'}
                    selectable={branch.isLive}
                    style={styles.url}
                  >
                    {bookingUrl(brand.urls.site, businessSlug, branch.code)}
                  </Text>
                </View>
                <Button
                  variant="secondary"
                  size="sm"
                  startIcon={Copy}
                  onPress={() => void copyBranch(branch.code)}
                  disabled={!branch.isLive}
                  accessibilityLabel={`${t('bookingSettings.linkCopy')}: ${branch.name}`}
                >
                  {t('bookingSettings.linkCopy')}
                </Button>
              </View>
            ))}
          </View>
        ) : null}
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
  locations: {
    gap: theme.spacing[8],
    marginTop: theme.spacing[12],
    paddingTop: theme.spacing[12],
    borderTopWidth: theme.borderWidth.hairline,
    borderTopColor: theme.colors.borderSubtle,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
  },
  locationText: {
    flex: 1,
    gap: theme.spacing[2],
  },
});
