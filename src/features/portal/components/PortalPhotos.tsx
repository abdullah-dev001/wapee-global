import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ImageIcon } from 'lucide-react-native';

import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { theme } from '@/lib/theme';

import { usePortalPhotos, usePortalPhotoUrls } from '../api/usePortal';

/** Only photos the business marked as shared, shown through 5-minute signed links that refresh themselves. */
export function PortalPhotos({ slug, session }: { slug: string; session: string }) {
  const { t } = useTranslation();
  const list = usePortalPhotos(slug, session, true);
  const urls = usePortalPhotoUrls(slug, session, list.data?.rows.map((r) => r.id) ?? []);

  if (list.isPending) return <Skeleton height={160} radius="md" />;
  if (list.isError) {
    return (
      <ErrorState
        title={t('portal.loadErrorTitle')}
        description={t('portal.loadErrorBody')}
        onRetry={() => list.refetch()}
        retryLabel={t('actions.retry')}
        compact
      />
    );
  }
  if (list.data.rows.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title={t('portal.photos.empty')}
        description={t('portal.photos.emptyBody')}
      />
    );
  }
  return (
    <View style={styles.grid}>
      {list.data.rows.map((r) => {
        const uri = urls.data?.[r.id];
        return uri ? (
          <Image
            key={r.id}
            source={{ uri }}
            accessibilityLabel={t('portal.photos.alt')}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : (
          <Skeleton key={r.id} width={150} height={150} radius="md" />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[12] },
  photo: {
    width: 150,
    height: 150,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
  },
});
