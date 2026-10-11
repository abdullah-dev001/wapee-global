import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui';
import { formatMoney, money } from '@/lib/money';
import { formatDuration } from '@/lib/time';
import { theme, useBreakpoint } from '@/lib/theme';

import { type WebsiteServiceItem } from '../../types';
import { AccentButton } from './AccentButton';
import { SectionShell } from './SectionShell';
import { WText } from './WText';
import { useWebsiteTheme } from './WebsiteThemeContext';

export type ServicesSectionProps = {
  title: string;
  intro: string | null;
  services: WebsiteServiceItem[];
  bookLabel: string;
};

/** Live services (the database decides which, and whether prices show). A Book button follows booking settings. */
export function ServicesSection({ title, intro, services, bookLabel }: ServicesSectionProps) {
  const { locale, currency, bookable, onBook, theme: site } = useWebsiteTheme();
  const { isMobile } = useBreakpoint();

  return (
    <SectionShell title={title} tinted>
      {intro ? (
        <WText variant="paragraph" color="textSecondary">
          {intro}
        </WText>
      ) : null}
      <View style={styles.grid}>
        {services.map((service, index) => (
          <View
            key={`${service.name}-${index}`}
            style={isMobile ? styles.cellFull : styles.cellHalf}
          >
            <Card style={{ borderRadius: site.cardRadius }}>
              <View style={styles.cardBody}>
                <View style={styles.titleRow}>
                  <View style={styles.titleText}>
                    <WText variant="cardTitle">{service.name}</WText>
                    {service.categoryName ? (
                      <WText variant="helper" color="textMuted">
                        {service.categoryName}
                      </WText>
                    ) : null}
                  </View>
                  {service.priceMinor !== null ? (
                    <WText variant="bodyStrong" color="accent">
                      {formatMoney(money(service.priceMinor, currency), locale)}
                    </WText>
                  ) : null}
                </View>
                {service.description ? (
                  <WText variant="small" color="textSecondary">
                    {service.description}
                  </WText>
                ) : null}
                <View style={styles.footerRow}>
                  {service.durationMinutes ? (
                    <WText variant="helper" color="textSecondary">
                      {formatDuration(service.durationMinutes, locale)}
                    </WText>
                  ) : (
                    <View />
                  )}
                  {bookable ? (
                    <AccentButton tone="outline" onPress={onBook}>
                      {bookLabel}
                    </AccentButton>
                  ) : null}
                </View>
              </View>
            </Card>
          </View>
        ))}
      </View>
    </SectionShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -theme.spacing[8] },
  cellFull: { width: '100%', padding: theme.spacing[8] },
  cellHalf: { width: '50%', padding: theme.spacing[8] },
  cardBody: { gap: theme.spacing[10] },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing[12] },
  titleText: { flexShrink: 1, gap: theme.spacing[2] },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
  },
});
