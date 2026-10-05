import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { theme, useBreakpoint } from '@/lib/theme';

import { type SocialNetwork, type WebsiteModel, type WebsiteSection } from '../../types';
import { AboutSection } from './AboutSection';
import { AccentButton } from './AccentButton';
import { ContactSection } from './ContactSection';
import { FaqSection } from './FaqSection';
import { GallerySection } from './GallerySection';
import { HeroSection } from './HeroSection';
import { ServicesSection } from './ServicesSection';
import { TestimonialsSection } from './TestimonialsSection';
import { WEBSITE_MAX_WIDTH } from './SectionShell';
import { WText } from './WText';
import { WebsiteProvider, useWebsiteTheme } from './WebsiteThemeContext';

export type WebsiteViewProps = {
  model: WebsiteModel;
  /** Opens the booking flow (public page) or does nothing (editor preview). */
  onBook: () => void;
};

/**
 * The whole website, rendered from a view model. PRESENTATIONAL and shared: the
 * public page feeds it `get_website`; the editor's live preview feeds it the
 * draft being edited. Section order and visibility are already decided by the
 * model (`sections` is the ordered, visible, non-empty list).
 */
export function WebsiteView({ model, onBook }: WebsiteViewProps) {
  const { i18n } = useTranslation();

  return (
    <WebsiteProvider
      brandColor={model.theme.brandColor}
      fontKey={model.theme.fontKey}
      radiusKey={model.theme.radiusKey}
      locale={i18n.language}
      bookable={model.bookable}
      currency={model.branch.currency}
      onBook={onBook}
    >
      <TopBar model={model} />
      {model.sections.map((section, index) => (
        <SectionSwitch key={`${section.type}-${index}`} section={section} model={model} />
      ))}
      <Footer name={model.businessName} />
    </WebsiteProvider>
  );
}

function TopBar({ model }: { model: WebsiteModel }) {
  const { t } = useTranslation();
  const { bookable, onBook } = useWebsiteTheme();
  const { isMobile } = useBreakpoint();
  const gutter = isMobile ? theme.layout.pagePaddingMobile : theme.layout.pagePadding;

  return (
    <View style={styles.topBarOuter}>
      <View style={[styles.topBar, { paddingHorizontal: gutter }]}>
        <View style={styles.brand}>
          {model.theme.logoUrl ? (
            <Image
              source={{ uri: model.theme.logoUrl }}
              accessibilityLabel={model.businessName}
              resizeMode="contain"
              style={styles.logo}
            />
          ) : null}
          <WText variant="cardTitle" numberOfLines={1} style={styles.brandName}>
            {model.businessName}
          </WText>
        </View>
        {bookable ? <AccentButton onPress={onBook}>{t('website.bookNow')}</AccentButton> : null}
      </View>
    </View>
  );
}

function SectionSwitch({ section, model }: { section: WebsiteSection; model: WebsiteModel }) {
  const { t } = useTranslation();

  switch (section.type) {
    case 'hero':
      return (
        <HeroSection
          headline={section.headline ?? model.businessName}
          subheadline={section.subheadline}
          ctaLabel={section.ctaLabel ?? t('website.bookNow')}
          heroImageUrl={model.theme.heroImageUrl}
        />
      );
    case 'about':
      return section.body ? (
        <AboutSection title={section.title ?? t('website.defaults.about')} body={section.body} />
      ) : null;
    case 'services':
      return (
        <ServicesSection
          title={section.title ?? t('website.defaults.services')}
          intro={section.intro}
          services={section.services}
          bookLabel={t('website.book')}
        />
      );
    case 'gallery':
      return (
        <GallerySection
          title={section.title ?? t('website.defaults.gallery')}
          images={section.images}
          fallbackAlt={t('website.galleryImage', { name: model.businessName })}
        />
      );
    case 'testimonials':
      return (
        <TestimonialsSection
          title={section.title ?? t('website.defaults.testimonials')}
          reviews={section.reviews}
          replyLabel={t('website.ownerReply', { name: model.businessName })}
          ratingLabel={(rating) => t('website.ratingLabel', { rating })}
        />
      );
    case 'faqs':
      return (
        <FaqSection title={section.title ?? t('website.defaults.faqs')} items={section.items} />
      );
    case 'contact':
      return (
        <ContactSection
          title={section.title ?? t('website.defaults.contact')}
          address={model.branch.address}
          phone={model.branch.phone}
          whatsapp={section.whatsapp}
          mapUrl={section.mapUrl}
          social={section.social}
          hours={model.hours}
          labels={{
            call: t('website.call'),
            whatsapp: t('website.whatsapp'),
            map: t('website.map'),
            hours: t('website.hours'),
            closed: t('website.closed'),
            socialName: (network: SocialNetwork) => t(`website.social.${network}`),
          }}
        />
      );
  }
}

function Footer({ name }: { name: string }) {
  const { isMobile } = useBreakpoint();
  const gutter = isMobile ? theme.layout.pagePaddingMobile : theme.layout.pagePadding;
  const { t } = useTranslation();
  return (
    <View style={[styles.footer, { paddingHorizontal: gutter }]}>
      <WText variant="helper" color="textMuted" align="center">
        {t('website.footer', { year: new Date().getFullYear(), name })}
      </WText>
    </View>
  );
}

const styles = StyleSheet.create({
  topBarOuter: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: theme.borderWidth.hairline,
    borderBottomColor: theme.colors.border,
  },
  topBar: {
    width: '100%',
    maxWidth: WEBSITE_MAX_WIDTH,
    alignSelf: 'center',
    minHeight: theme.layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[8],
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[10], flexShrink: 1 },
  brandName: { flexShrink: 1 },
  logo: { width: theme.controlHeight.lg, height: theme.controlHeight.lg },
  footer: { paddingVertical: theme.spacing[32] },
});
