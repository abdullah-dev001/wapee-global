import { Clock, MapPin, MessageCircle, Phone } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

import { weekdayNames, firstDayOfWeek } from '@/features/schedule/weekdays';
import { hoursRows } from '../../hoursDisplay';
import { mapsUrl, telUrl, whatsappUrl } from '../../links';
import { type WebsiteHour, type SocialNetwork } from '../../types';
import { AccentButton } from './AccentButton';
import { SectionShell } from './SectionShell';
import { WText } from './WText';
import { useWebsiteTheme } from './WebsiteThemeContext';

export type ContactSectionProps = {
  title: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  mapUrl: string | null;
  social: Partial<Record<SocialNetwork, string>>;
  hours: WebsiteHour[];
  labels: {
    call: string;
    whatsapp: string;
    map: string;
    hours: string;
    closed: string;
    socialName: (network: SocialNetwork) => string;
  };
};

/** Address, map link, phone, opening hours (from the branch), WhatsApp and social links. */
export function ContactSection({
  title,
  address,
  phone,
  whatsapp,
  mapUrl,
  social,
  hours,
  labels,
}: ContactSectionProps) {
  const { locale } = useWebsiteTheme();
  const names = weekdayNames(locale, 'long');
  const rows = hoursRows(hours, firstDayOfWeek(locale));
  const map = mapsUrl(mapUrl, address);
  const tel = telUrl(phone);
  const wa = whatsappUrl(whatsapp);
  const socials = Object.entries(social) as [SocialNetwork, string][];

  return (
    <SectionShell title={title}>
      <View style={styles.columns}>
        <View style={styles.column}>
          {address ? (
            <View style={styles.line}>
              <MapPin
                size={theme.iconSize.lg}
                strokeWidth={theme.iconStroke}
                color={theme.colors.textSecondary}
              />
              <WText variant="body" style={styles.lineText}>
                {address}
              </WText>
            </View>
          ) : null}
          {phone ? (
            <View style={styles.line}>
              <Phone
                size={theme.iconSize.lg}
                strokeWidth={theme.iconStroke}
                color={theme.colors.textSecondary}
              />
              <WText variant="body" style={styles.lineText}>
                {phone}
              </WText>
            </View>
          ) : null}
          <View style={styles.buttons}>
            {tel ? (
              <AccentButton tone="outline" startIcon={Phone} href={tel}>
                {labels.call}
              </AccentButton>
            ) : null}
            {wa ? (
              <AccentButton tone="outline" startIcon={MessageCircle} href={wa}>
                {labels.whatsapp}
              </AccentButton>
            ) : null}
            {map ? (
              <AccentButton tone="outline" startIcon={MapPin} href={map}>
                {labels.map}
              </AccentButton>
            ) : null}
          </View>
          {socials.length > 0 ? (
            <View style={styles.buttons}>
              {socials.map(([network, url]) => (
                <AccentButton key={network} tone="outline" href={url}>
                  {labels.socialName(network)}
                </AccentButton>
              ))}
            </View>
          ) : null}
        </View>

        {hours.length > 0 ? (
          <View style={styles.column}>
            <View style={styles.line}>
              <Clock
                size={theme.iconSize.lg}
                strokeWidth={theme.iconStroke}
                color={theme.colors.textSecondary}
              />
              <WText variant="cardTitle">{labels.hours}</WText>
            </View>
            {rows.map((row) => (
              <View key={row.dayOfWeek} style={styles.hoursRow}>
                <WText variant="body" color="textSecondary">
                  {names[row.dayOfWeek]}
                </WText>
                <WText variant="body">
                  {row.ranges.length > 0 ? row.ranges.join(', ') : labels.closed}
                </WText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </SectionShell>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[24] },
  column: { flexGrow: 1, flexBasis: 280, gap: theme.spacing[12] },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[10] },
  lineText: { flexShrink: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8] },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing[12] },
});
