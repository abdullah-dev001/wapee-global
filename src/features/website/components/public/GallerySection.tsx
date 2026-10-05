import { Image, StyleSheet, View } from 'react-native';

import { theme, useBreakpoint } from '@/lib/theme';

import { SectionShell } from './SectionShell';
import { useWebsiteTheme } from './WebsiteThemeContext';

export type GallerySectionProps = {
  title: string | null;
  images: { url: string; alt: string | null }[];
  /** Fallback accessible name when an image has no alt text. */
  fallbackAlt: string;
};

export function GallerySection({ title, images, fallbackAlt }: GallerySectionProps) {
  const { theme: site } = useWebsiteTheme();
  const { isMobile } = useBreakpoint();

  return (
    <SectionShell title={title}>
      <View style={styles.grid}>
        {images.map((image, index) => (
          <View key={`${image.url}-${index}`} style={isMobile ? styles.cellHalf : styles.cellThird}>
            <Image
              source={{ uri: image.url }}
              accessibilityLabel={image.alt ?? fallbackAlt}
              resizeMode="cover"
              style={[styles.image, { borderRadius: site.cardRadius }]}
            />
          </View>
        ))}
      </View>
    </SectionShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -theme.spacing[4] },
  cellHalf: { width: '50%', padding: theme.spacing[4] },
  cellThird: { width: '33.3333%', padding: theme.spacing[4] },
  image: { width: '100%', aspectRatio: 1, backgroundColor: theme.colors.surfaceHover },
});
