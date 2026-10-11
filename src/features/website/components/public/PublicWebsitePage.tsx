import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageContainer, Screen } from '@/components/layout';
import { ErrorState, Skeleton } from '@/components/ui';
import { theme } from '@/lib/theme';

import { usePublicWebsite } from '../../api/usePublicWebsite';
import { WEBSITE_MAX_WIDTH } from './SectionShell';
import { WebsiteHead } from './WebsiteHead';
import { WebsiteNotFound } from './WebsiteNotFound';
import { WebsiteView } from './WebsiteView';

/** `(public)/[slug]`: the business website. Data only from `get_website`. */
export function PublicWebsitePage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const site = usePublicWebsite(slug);

  const onBook = useCallback(() => router.push(`/${slug}/book`), [router, slug]);

  if (site.isPending) return <WebsiteSkeleton />;

  if (site.isError) {
    const code = (site.error as { code?: string }).code;
    if (code === 'not_found' || code === 'bad_request') return <WebsiteNotFound />;
    return (
      <Screen>
        <PageContainer fill>
          <ErrorState
            title={t('website.loadErrorTitle')}
            description={t('website.loadErrorMessage')}
            onRetry={() => void site.refetch()}
            retryLabel={t('actions.retry')}
          />
        </PageContainer>
      </Screen>
    );
  }

  return (
    // Default edges (top and bottom): this page is not inside the tab bar, so the
    // bottom safe area is ours to pad.
    <Screen>
      <WebsiteHead model={site.data} />
      <WebsiteView model={site.data} onBook={onBook} />
    </Screen>
  );
}

function WebsiteSkeleton() {
  return (
    <Screen>
      <View style={styles.skeleton} accessibilityElementsHidden>
        <Skeleton height={theme.layout.headerHeight} radius="lg" />
        <Skeleton height={220} radius="lg" />
        <Skeleton width="60%" height={20} />
        <Skeleton height={14} />
        <Skeleton height={14} width="85%" />
        <Skeleton height={120} radius="lg" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    width: '100%',
    maxWidth: WEBSITE_MAX_WIDTH,
    alignSelf: 'center',
    padding: theme.layout.pagePaddingMobile,
    gap: theme.spacing[16],
  },
});
