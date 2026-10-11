import { ImageBackground, StyleSheet, View } from 'react-native';

import { theme, useBreakpoint } from '@/lib/theme';

import { AccentButton } from './AccentButton';
import { WEBSITE_MAX_WIDTH } from './SectionShell';
import { WText } from './WText';
import { useWebsiteTheme } from './WebsiteThemeContext';

export type HeroSectionProps = {
  /** Falls back to the business name when the owner left the headline empty. */
  headline: string;
  subheadline: string | null;
  ctaLabel: string;
  heroImageUrl: string | null;
};

/** Top banner: the brand colour (or a photo under a strong brand-colour wash) with a Book button. */
export function HeroSection({ headline, subheadline, ctaLabel, heroImageUrl }: HeroSectionProps) {
  const { theme: site, bookable, onBook } = useWebsiteTheme();
  const { isMobile } = useBreakpoint();
  const gutter = isMobile ? theme.layout.pagePaddingMobile : theme.layout.pagePadding;

  const content = (
    <View
      style={[
        styles.inner,
        {
          paddingHorizontal: gutter,
          paddingVertical: isMobile ? theme.spacing[48] : theme.spacing[48] * 2,
        },
      ]}
    >
      <WText
        variant={isMobile ? 'headlineMobile' : 'headline'}
        accessibilityRole="header"
        style={{ color: site.onAccent }}
      >
        {headline}
      </WText>
      {subheadline ? (
        <WText variant="paragraph" style={{ color: site.onAccent }}>
          {subheadline}
        </WText>
      ) : null}
      {bookable ? (
        <AccentButton tone="surface" onPress={onBook}>
          {ctaLabel}
        </AccentButton>
      ) : null}
    </View>
  );

  if (heroImageUrl) {
    return (
      <ImageBackground
        source={{ uri: heroImageUrl }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      >
        {/* A strong brand-colour wash keeps the text readable whatever photo was chosen. */}
        <View style={[styles.wash, { backgroundColor: site.accent }]} />
        {content}
      </ImageBackground>
    );
  }
  return <View style={{ backgroundColor: site.accent }}>{content}</View>;
}

/** How strongly the brand colour covers a hero photo. High on purpose: text contrast must hold on any image. */
const HERO_WASH_OPACITY = 0.82;

const styles = StyleSheet.create({
  inner: {
    width: '100%',
    maxWidth: WEBSITE_MAX_WIDTH,
    alignSelf: 'center',
    gap: theme.spacing[16],
  },
  wash: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0, opacity: HERO_WASH_OPACITY },
});
